/**
 * Official platform policy sources, and citations drawn from them.
 *
 * A policy citation is only worth anything if the document behind it was really
 * retrieved. So nothing in this module states what a policy says: it names the
 * official document and, per violation, the section headings that would cover
 * it. At runtime the document is fetched, and a section is cited ONLY when a
 * heading element with that text is actually present in what came back. The
 * excerpt is the document's own text following that heading, and the citation
 * carries the final URL, the page <title>, the retrieval time and the SHA-256 of
 * the fetched body so anyone can check it.
 *
 * When the fetch fails, the heading is missing, the platform has no registered
 * source, or the violation has no mapped section, the answer is
 * NO_SUPPORTED_POLICY_ROUTE — the rule is never cited from memory.
 */

import { createHash } from "node:crypto";

export type PolicyCitation = {
  platform: string;
  violation: string;
  /** The official URL requested. */
  documentUrl: string;
  /** Where the request actually ended up after redirects. This is what is cited. */
  finalUrl: string;
  /** The document's own <title>, entity-decoded. */
  title: string;
  /** The heading as it appears in the retrieved document. */
  section: string;
  /** The document's text following that heading, whitespace-collapsed, at most 300 characters. */
  excerpt: string;
  retrievedAt: string;
  /** SHA-256 of the fetched body (the first MAX_BYTES when the body was larger). */
  documentSha256: string;
  /** True when the body exceeded MAX_BYTES and only its start was read. */
  truncated: boolean;
};

export type PolicyLookup =
  | { status: "CITED"; citation: PolicyCitation }
  | { status: "NO_SUPPORTED_POLICY_ROUTE"; reason: string };

type SectionCandidate = {
  /** The heading text to look for, compared after normalisation. */
  heading: string;
  /**
   * Optional phrase inside that section where the excerpt starts, so a broad
   * section is cited at the passage that applies. Used only if it is present
   * in the retrieved section text; otherwise the excerpt starts at the heading.
   */
  anchor?: string;
};

type PolicySource = {
  platform: string;
  url: string;
  /** Candidate sections per violation, in order of preference. */
  sections: Record<string, SectionCandidate[]>;
};

/**
 * The registered official sources. Headings were read from the live documents
 * on 2026-09-25; they are candidates only and are re-checked on every fetch.
 */
export const POLICY_SOURCES: Record<string, PolicySource> = {
  google: {
    platform: "google",
    url: "https://support.google.com/contributionpolicy/answer/7400114?hl=en",
    sections: {
      fake_or_incentivised: [{ heading: "Fake engagement" }, { heading: "Rating Manipulation" }],
      spam_or_advertising: [{ heading: "Advertising & solicitation" }],
      hate_or_harassment: [{ heading: "Harassment" }, { heading: "Hate speech" }],
      profanity_or_obscenity: [{ heading: "Obscenity & profanity" }],
      off_topic: [{ heading: "Off-topic" }],
      conflict_of_interest: [{ heading: "Rating Manipulation", anchor: "Content that is based on a conflict of interest" }],
      personal_information: [{ heading: "Personal information" }],
    },
  },
  trustpilot: {
    platform: "trustpilot",
    url: "https://legal.trustpilot.com/for-reviewers/guidelines-for-reviewers",
    sections: {
      fake_or_incentivised: [{ heading: "What about fake reviews?" }, { heading: "Not based on a genuine experience" }],
      spam_or_advertising: [{ heading: "Advertising or promotional" }],
      hate_or_harassment: [{ heading: "Harmful or illegal", anchor: "Hate speech or discrimination" }],
      profanity_or_obscenity: [{ heading: "Harmful or illegal", anchor: "Obscenity:" }],
      off_topic: [{ heading: "Advertising or promotional", anchor: "Purely advertising a political" }],
      conflict_of_interest: [{ heading: "Who can and can’t write a review?", anchor: "special relationship to the business" }],
      personal_information: [{ heading: "Personal information" }],
    },
  },
};

export const FETCH_TIMEOUT_MS = 20_000;
export const MAX_BYTES = 3 * 1024 * 1024;
export const CACHE_TTL_MS = 24 * 3_600_000;
export const MAX_EXCERPT = 300;

// ---------------------------------------------------------------------------
// Pure HTML handling
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Markup to readable text: scripts and styles dropped, tags removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return decodeEntities(stripNonContent(html).replace(/<[^>]*>/g, " "))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNonContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** Comparison form for running text: case, quotes, dashes and spacing do not matter. */
function normaliseText(text: string): string {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Comparison form for a heading: as above, and a trailing colon does not matter either. */
function normalise(text: string): string {
  return normaliseText(text).replace(/:$/, "").trim();
}

export function extractTitle(html: string): string {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? htmlToText(match[1]!) : "";
}

type Heading = { text: string; start: number; end: number };

/**
 * Heading elements in document order: <h1>-<h6>, elements carrying the class
 * "zippy" (Google Help Center section toggles), and paragraphs whose whole
 * content is bold (Trustpilot's sub-section headings). Running text is never
 * treated as a heading, so a word in a sentence cannot be cited as a section.
 */
export function findHeadings(html: string): Heading[] {
  const found: Heading[] = [];
  const patterns = [
    /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi,
    /<(a|p|span|button)\b[^>]*class="(?:[^"]*\s)?zippy(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/\1>/gi,
    // Unrolled so it cannot run past the paragraph it started in.
    /<p\b[^>]*>\s*<(b|strong)\b[^>]*>([^<]*(?:<(?!\/?(?:b|strong|p)\b)[^<]*)*)<\/\1>\s*<\/p>/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const text = htmlToText(match[2]!);
      if (text.length > 0 && text.length <= 120) found.push({ text, start: match.index, end: match.index + match[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start);
  // The same element matched by two patterns is kept once.
  return found.filter((h, i) => i === 0 || h.start !== found[i - 1]!.start);
}

/** Parsing a multi-megabyte page is done once per document, not once per violation. */
const parsedCache = new Map<string, { content: string; headings: Heading[] }>();
function parsed(html: string): { content: string; headings: Heading[] } {
  const hit = parsedCache.get(html);
  if (hit) return hit;
  const content = stripNonContent(html);
  const value = { content, headings: findHeadings(content) };
  if (parsedCache.size >= 4) parsedCache.delete(parsedCache.keys().next().value!);
  parsedCache.set(html, value);
  return value;
}

/**
 * Finds a section heading in the document and returns the text that follows it,
 * up to the next heading, cut to MAX_EXCERPT characters. null when the heading
 * is not present.
 */
export function extractSection(
  html: string,
  candidate: SectionCandidate,
): { section: string; excerpt: string } | null {
  const { content, headings } = parsed(html);
  const wanted = normalise(candidate.heading);
  const index = headings.findIndex((h) => normalise(h.text) === wanted);
  if (index === -1) return null;
  const heading = headings[index]!;
  const next = headings.slice(index + 1).find((h) => h.start >= heading.end);
  const body = htmlToText(content.slice(heading.end, next ? next.start : heading.end + 40_000));
  if (!body) return null;

  let from = 0;
  if (candidate.anchor) {
    const at = normaliseText(body).indexOf(normaliseText(candidate.anchor));
    // normaliseText() only lowercases and maps quotes and dashes one-for-one, and
    // `body` is already whitespace-collapsed and trimmed, so offsets line up.
    if (at >= 0) from = at;
  }
  return { section: heading.text, excerpt: cut(body.slice(from), MAX_EXCERPT) };
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(" ");
  return `${space > max / 2 ? slice.slice(0, space) : slice}…`;
}

/** Pure: the citation for one violation from an already retrieved document. */
export function citeFromDocument(
  doc: RetrievedDocument,
  platform: string,
  violation: string,
): PolicyLookup {
  const source = POLICY_SOURCES[platform];
  if (!source) return { status: "NO_SUPPORTED_POLICY_ROUTE", reason: `No official policy source is registered for ${platform}.` };
  const candidates = source.sections[violation];
  if (!candidates || candidates.length === 0) {
    return { status: "NO_SUPPORTED_POLICY_ROUTE", reason: `No section of the ${platform} policy is mapped to ${violation}.` };
  }
  for (const candidate of candidates) {
    const found = extractSection(doc.body, candidate);
    if (!found) continue;
    return {
      status: "CITED",
      citation: {
        platform,
        violation,
        documentUrl: source.url,
        finalUrl: doc.finalUrl,
        title: doc.title,
        section: found.section,
        excerpt: found.excerpt,
        retrievedAt: doc.retrievedAt,
        documentSha256: doc.sha256,
        truncated: doc.truncated,
      },
    };
  }
  return {
    status: "NO_SUPPORTED_POLICY_ROUTE",
    reason: `The retrieved ${platform} policy document does not contain the section heading${candidates.length > 1 ? "s" : ""} ${candidates.map((c) => `"${c.heading}"`).join(", ")}.`,
  };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export type RetrievedDocument = {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  body: string;
  retrievedAt: string;
  sha256: string;
  truncated: boolean;
};

let fetcher: typeof fetch = (...args) => fetch(...args);
const cache = new Map<string, RetrievedDocument>();
const inFlight = new Map<string, Promise<RetrievedDocument>>();

/** Replaces the fetch used for policy documents (tests use an in-memory one) and clears the cache. */
export function setPolicyFetcher(next: typeof fetch | null): void {
  fetcher = next ?? ((...args) => fetch(...args));
  cache.clear();
  inFlight.clear();
}

async function readCapped(response: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!response.body) {
    const all = new Uint8Array(await response.arrayBuffer());
    return { bytes: all.slice(0, MAX_BYTES), truncated: all.length > MAX_BYTES };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.length > MAX_BYTES) {
      chunks.push(value.slice(0, MAX_BYTES - total));
      total = MAX_BYTES;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, truncated };
}

/** Fetches an official document, cached for up to 24 hours. Throws on any failure. */
export async function retrieveDocument(url: string, now: Date = new Date()): Promise<RetrievedDocument> {
  const cached = cache.get(url);
  if (cached && now.getTime() - Date.parse(cached.retrievedAt) < CACHE_TTL_MS) return cached;
  const pending = inFlight.get(url);
  if (pending) return pending;

  const job = (async () => {
    const response = await fetcher(url, {
      redirect: "follow",
      headers: { accept: "text/html", "accept-language": "en" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    const { bytes, truncated } = await readCapped(response);
    const body = new TextDecoder("utf-8").decode(bytes);
    const doc: RetrievedDocument = {
      requestedUrl: url,
      finalUrl: response.url || url,
      title: extractTitle(body),
      body,
      retrievedAt: new Date().toISOString(),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      truncated,
    };
    cache.set(url, doc);
    return doc;
  })();
  inFlight.set(url, job);
  try {
    return await job;
  } finally {
    inFlight.delete(url);
  }
}

/**
 * The citation for one platform and violation, retrieving the official
 * document if needed. Never throws: any failure is NO_SUPPORTED_POLICY_ROUTE
 * with the reason.
 */
export async function lookupPolicyCitation(platform: string, violation: string): Promise<PolicyLookup> {
  const source = POLICY_SOURCES[platform];
  if (!source) return { status: "NO_SUPPORTED_POLICY_ROUTE", reason: `No official policy source is registered for ${platform}.` };
  let doc: RetrievedDocument;
  try {
    doc = await retrieveDocument(source.url);
  } catch (caught) {
    return {
      status: "NO_SUPPORTED_POLICY_ROUTE",
      reason: `The official ${platform} policy document could not be retrieved: ${caught instanceof Error ? caught.message : String(caught)}`,
    };
  }
  return citeFromDocument(doc, platform, violation);
}
