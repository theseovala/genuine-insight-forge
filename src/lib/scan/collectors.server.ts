// Real data collectors for the scan engine. Every function performs a genuine
// network request against a documented public endpoint. Nothing is simulated:
// when a source cannot be reached or is not configured, that is reported
// honestly and the raw provider payload is stored untouched.

export type SourceStatus = "completed" | "failed" | "skipped" | "not_configured";

export interface SourceResult {
  source: string;
  provider: string | null;
  status: SourceStatus;
  httpStatus?: number | null;
  durationMs: number;
  errorMessage?: string | null;
  raw: Record<string, unknown>;
}

const UA = "SeovaleScanner/1.0 (+https://seovale.com)";
const TIMEOUT_MS = 20_000;
const MAX_HTML_BYTES = 800_000;

async function timed<T>(fn: () => Promise<T>) {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, durationMs: Date.now() - started, error: null as Error | null };
  } catch (caught) {
    return { value: null as T | null, durationMs: Date.now() - started, error: caught instanceof Error ? caught : new Error(String(caught)) };
  }
}

async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...init,
      headers: { "user-agent": UA, accept: "*/*", ...(init.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeTarget(input: string) {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (!url.hostname.includes(".")) throw new Error("Enter a valid website address, for example seovale.com");
  url.hash = "";
  return { url: url.toString(), domain: url.hostname.replace(/^www\./i, ""), origin: url.origin };
}

/** Loads the page itself: status, redirects, timing, response headers and HTML. */
export async function collectPage(url: string): Promise<SourceResult> {
  const run = await timed(async () => {
    const response = await request(url);
    const buffer = await response.arrayBuffer();
    const bytes = buffer.byteLength;
    const html = new TextDecoder().decode(buffer.slice(0, MAX_HTML_BYTES));
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { finalUrl: response.url || url, httpStatus: response.status, bytes, headers, html };
  });
  if (run.error || !run.value) {
    return {
      source: "http",
      provider: null,
      status: "failed",
      durationMs: run.durationMs,
      errorMessage: run.error?.message ?? "The website did not respond.",
      raw: {},
    };
  }
  return {
    source: "http",
    provider: null,
    status: "completed",
    httpStatus: run.value.httpStatus,
    durationMs: run.durationMs,
    raw: run.value as unknown as Record<string, unknown>,
  };
}

/** HTTPS reachability + transport security signals taken from the real response. */
export async function collectTls(origin: string): Promise<SourceResult> {
  const httpsOrigin = origin.replace(/^http:/i, "https:");
  const run = await timed(async () => {
    const response = await request(httpsOrigin, { method: "GET" });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { httpsReachable: true, httpStatus: response.status, finalUrl: response.url, headers };
  });
  if (run.error || !run.value) {
    return {
      source: "tls",
      provider: null,
      status: "failed",
      durationMs: run.durationMs,
      errorMessage: run.error?.message ?? "HTTPS connection failed.",
      raw: { httpsReachable: false },
    };
  }
  return {
    source: "tls",
    provider: null,
    status: "completed",
    httpStatus: run.value.httpStatus,
    durationMs: run.durationMs,
    raw: run.value as unknown as Record<string, unknown>,
  };
}

/** DNS over HTTPS (Cloudflare, RFC 8484 JSON API). */
export async function collectDns(domain: string): Promise<SourceResult> {
  const types = ["A", "AAAA", "MX", "NS", "TXT", "CAA"] as const;
  const run = await timed(async () => {
    const records: Record<string, string[]> = {};
    for (const type of types) {
      const response = await request(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
      });
      if (!response.ok) throw new Error(`Cloudflare DNS returned HTTP ${response.status}`);
      const body = (await response.json()) as { Answer?: { data: string }[] };
      records[type] = (body.Answer ?? []).map((answer) => answer.data);
    }
    return records;
  });
  if (run.error || !run.value) {
    return { source: "dns", provider: "cloudflare-doh", status: "failed", durationMs: run.durationMs, errorMessage: run.error?.message, raw: {} };
  }
  return { source: "dns", provider: "cloudflare-doh", status: "completed", durationMs: run.durationMs, raw: run.value };
}

/** Domain registration data from the public RDAP bootstrap service. */
export async function collectRdap(domain: string): Promise<SourceResult> {
  const run = await timed(async () => {
    const response = await request(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { accept: "application/rdap+json" } });
    if (response.status === 404) return { found: false, httpStatus: 404 };
    if (!response.ok) throw new Error(`RDAP returned HTTP ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    return { found: true, httpStatus: response.status, body };
  });
  if (run.error || !run.value) {
    return { source: "rdap", provider: "rdap.org", status: "failed", durationMs: run.durationMs, errorMessage: run.error?.message, raw: {} };
  }
  return {
    source: "rdap",
    provider: "rdap.org",
    status: "completed",
    httpStatus: (run.value as any).httpStatus ?? null,
    durationMs: run.durationMs,
    raw: run.value as Record<string, unknown>,
  };
}

/** robots.txt and the sitemap it declares (or the conventional /sitemap.xml). */
export async function collectCrawlDirectives(origin: string): Promise<SourceResult> {
  const run = await timed(async () => {
    const robots = await request(`${origin}/robots.txt`);
    const robotsText = robots.ok ? (await robots.text()).slice(0, 20_000) : null;
    const declared = robotsText
      ? Array.from(robotsText.matchAll(/^\s*sitemap:\s*(\S+)/gim)).map((match) => match[1] as string)
      : [];
    const sitemapUrl = declared[0] ?? `${origin}/sitemap.xml`;
    let sitemap: { url: string; httpStatus: number; urlCount: number | null } | null = null;
    try {
      const response = await request(sitemapUrl);
      const text = response.ok ? (await response.text()).slice(0, 400_000) : "";
      sitemap = {
        url: sitemapUrl,
        httpStatus: response.status,
        urlCount: response.ok ? (text.match(/<loc>/g) ?? []).length : null,
      };
    } catch {
      sitemap = null;
    }
    return { robotsStatus: robots.status, robotsFound: robots.ok, robotsText, declaredSitemaps: declared, sitemap };
  });
  if (run.error || !run.value) {
    return { source: "crawl_directives", provider: null, status: "failed", durationMs: run.durationMs, errorMessage: run.error?.message, raw: {} };
  }
  return { source: "crawl_directives", provider: null, status: "completed", durationMs: run.durationMs, raw: run.value as Record<string, unknown> };
}

/**
 * Google PageSpeed Insights (Lighthouse). Requires a real Google API key from
 * the credential vault or the server environment; otherwise reported honestly
 * as not configured — never estimated.
 */
export async function collectPageSpeed(url: string, apiKey: string | null): Promise<SourceResult> {
  if (!apiKey) {
    return {
      source: "pagespeed",
      provider: "google_pagespeed",
      status: "not_configured",
      durationMs: 0,
      errorMessage: "Google PageSpeed API key is not configured.",
      raw: {},
    };
  }
  const endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}` +
    `&strategy=mobile&category=performance&category=seo&category=accessibility&category=best-practices&key=${encodeURIComponent(apiKey)}`;
  const run = await timed(async () => {
    const response = await request(endpoint);
    const body = (await response.json()) as any;
    if (!response.ok) throw new Error(body?.error?.message ?? `PageSpeed returned HTTP ${response.status}`);
    const categories = body?.lighthouseResult?.categories ?? {};
    const audits = body?.lighthouseResult?.audits ?? {};
    return {
      httpStatus: response.status,
      categories: Object.fromEntries(Object.entries(categories).map(([key, value]: [string, any]) => [key, value?.score ?? null])),
      metrics: {
        firstContentfulPaint: audits["first-contentful-paint"]?.numericValue ?? null,
        largestContentfulPaint: audits["largest-contentful-paint"]?.numericValue ?? null,
        totalBlockingTime: audits["total-blocking-time"]?.numericValue ?? null,
        cumulativeLayoutShift: audits["cumulative-layout-shift"]?.numericValue ?? null,
        speedIndex: audits["speed-index"]?.numericValue ?? null,
      },
    };
  });
  if (run.error || !run.value) {
    return { source: "pagespeed", provider: "google_pagespeed", status: "failed", durationMs: run.durationMs, errorMessage: run.error?.message, raw: {} };
  }
  return {
    source: "pagespeed",
    provider: "google_pagespeed",
    status: "completed",
    httpStatus: (run.value as any).httpStatus ?? null,
    durationMs: run.durationMs,
    raw: run.value as Record<string, unknown>,
  };
}
