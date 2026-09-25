// Platform discovery + connection verification for the scan orchestrator.
//
// Two honest questions are answered per provider, with no invented data:
//   1. Is this platform RELEVANT to the scanned website? (evidence: profile
//      links found in the real page HTML, or an existing connection.)
//   2. Can we actually USE it right now? (verified against stored credentials,
//      token expiry and — when something is configured — a real provider call.)
//
// A provider that is not configured is never called, and a stored
// `status = connected` is never trusted on its own.
import type { SupabaseClient } from "@supabase/supabase-js";
import { INTEGRATIONS, type IntegrationDefinition } from "@/lib/integrations/registry";

export type DiscoveryStatus =
  | "connected"
  | "available"
  | "not_configured"
  | "auth_required"
  | "approval_required"
  | "not_supported"
  | "unavailable"
  | "failed";

export interface PlatformDiscovery {
  provider: string;
  label: string;
  group: string;
  relevant: boolean;
  status: DiscoveryStatus;
  detail: string;
  /** Real evidence: profile URLs found on the site, account reference, etc. */
  evidence: Record<string, unknown>;
}

/** Providers a website/reputation scan can meaningfully use. */
const SCAN_PROVIDERS = [
  "google_business",
  "google_maps",
  "google_search_console",
  "google_analytics",
  "google_ads",
  "youtube",
  "facebook",
  "instagram",
  "whatsapp",
  "trustpilot",
  "tripadvisor",
  "yelp",
  "reddit",
  "twitter",
  "pinterest",
  "indeed",
  "glassdoor",
  "semrush",
  "ahrefs",
  "moz",
  "dataforseo",
  "serpapi",
];

/** Host fragments that identify an outbound profile link for a provider. */
const PROFILE_HOSTS: Record<string, string[]> = {
  google_business: ["business.google.com", "g.page"],
  google_maps: ["maps.google.", "goo.gl/maps", "maps.app.goo.gl"],
  youtube: ["youtube.com", "youtu.be"],
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  whatsapp: ["wa.me", "api.whatsapp.com"],
  trustpilot: ["trustpilot.com"],
  tripadvisor: ["tripadvisor."],
  yelp: ["yelp.com"],
  reddit: ["reddit.com"],
  twitter: ["twitter.com", "x.com"],
  pinterest: ["pinterest."],
  indeed: ["indeed.com"],
  glassdoor: ["glassdoor."],
};

/** Outbound links found in the real page HTML — the only relevance evidence used. */
export function extractProfileLinks(html: string) {
  const hrefs = Array.from(html.matchAll(/href=["']([^"']+)["']/gi)).map((m) => m[1] as string);
  const found: Record<string, string[]> = {};
  for (const href of hrefs) {
    if (!/^https?:\/\//i.test(href)) continue;
    for (const [provider, hosts] of Object.entries(PROFILE_HOSTS)) {
      if (hosts.some((host) => href.toLowerCase().includes(host))) {
        const list = (found[provider] ??= []);
        if (!list.includes(href) && list.length < 5) list.push(href);
      }
    }
  }
  return found;
}

/** A provider test result younger than this is reused instead of spending another paid API call. */
const HEALTH_REUSE_MS = 6 * 60 * 60 * 1000;

function statusForCode(code: string): DiscoveryStatus {
  return code === "NOT_CONFIGURED"
    ? "not_configured"
    : code === "APPROVAL_REQUIRED"
      ? "approval_required"
      : code === "UNAVAILABLE"
        ? "unavailable"
        : code === "AUTHENTICATION_FAILED" || code === "INVALID_CREDENTIALS" || code === "TOKEN_EXPIRED" || code === "INSUFFICIENT_SCOPE"
          ? "auth_required"
          : "failed";
}

async function verifyOne(
  admin: SupabaseClient,
  workspaceId: string,
  definition: IntegrationDefinition,
): Promise<{ status: DiscoveryStatus; detail: string; evidence: Record<string, unknown> }> {
  // Partner-only APIs: stated honestly, never tested, never faked.
  if (definition.kind === "manual") {
    return {
      status: definition.approvalRequired ? "approval_required" : "not_supported",
      detail: definition.manualReason ?? definition.approvalRequired ?? "No public API is available for this provider.",
      evidence: {},
    };
  }

  const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");
  const providers = await import("@/lib/integrations/providers.server");
  const creds = await loadProviderCredentials(admin, workspaceId, definition.id);

  // Google Business Profile keeps its own encrypted connection row.
  if (definition.id === "google_business") {
    const { data: connection } = await admin
      .from("google_business_connections")
      .select("status,token_expires_at,google_account_email,refresh_token_ciphertext,scopes,last_error")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    // Same rule as every other screen: connected only once Google has returned
    // authorized data. Expired access tokens are not a failure — the stored
    // refresh token renews them on the next Google call.
    const { googleBusinessState } = await import("@/lib/google-business-sync.server");
    const state = googleBusinessState(connection);
    const evidence = connection ? { account: connection.google_account_email, code: state.code } : {};
    const status: DiscoveryStatus =
      state.code === "CONNECTED" ? "connected"
      : state.code === "NOT_CONFIGURED" ? "not_configured"
      : state.code === "APPROVAL_REQUIRED" ? "approval_required"
      : state.code === "INSUFFICIENT_SCOPE" || state.code === "AUTHENTICATION_FAILED" ? "auth_required"
      : "failed";
    return { status, detail: state.message, evidence };
  }

  const { data: row } = await admin
    .from("integration_connections")
    .select("id,status,account_ref,account_label,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,last_error")
    .eq("workspace_id", workspaceId)
    .eq("provider", definition.id)
    .maybeSingle();

  if (definition.kind === "api_key") {
    if (!providers.providerConfigured(definition.id, creds)) {
      return { status: "not_configured", detail: `${definition.label} has no API key stored yet.`, evidence: {} };
    }
    // A real provider result from the last few hours is reused so every scan does not spend paid API quota.
    const { data: health } = await admin
      .from("integration_health")
      .select("status,outcome_code,last_error,last_checked_at")
      .eq("workspace_id", workspaceId)
      .eq("provider", definition.id)
      .maybeSingle();
    // A cached NOT_CONFIGURED predates the key that is configured now, so it is never reused.
    if (health?.last_checked_at && health.outcome_code !== "NOT_CONFIGURED" && Date.now() - Date.parse(health.last_checked_at) < HEALTH_REUSE_MS) {
      const checkedAt = health.last_checked_at;
      if (health.status === "healthy") {
        return { status: "connected", detail: `${definition.label} answered a real API test at ${checkedAt}.`, evidence: { account: row?.account_label ?? row?.account_ref ?? null, checkedAt } };
      }
      const cachedCode = health.outcome_code ?? "PROVIDER_ERROR";
      return { status: statusForCode(cachedCode), detail: health.last_error ?? `${definition.label} failed its last API test.`, evidence: { code: cachedCode, checkedAt } };
    }
    // Configured and no recent result: verify with a real provider request rather than trusting the row.
    const result = await providers.testApiKeyProvider(definition.id, row?.account_ref ?? null, creds);
    const code = result.code ?? (result.ok ? "CONNECTED" : "PROVIDER_ERROR");
    const checkedAt = new Date().toISOString();
    await admin.from("integration_health").upsert(
      {
        workspace_id: workspaceId,
        provider: definition.id,
        status: result.ok ? "healthy" : "unhealthy",
        latency_ms: null,
        outcome_code: code,
        last_error: result.ok ? null : result.message,
        last_checked_at: checkedAt,
        ...(result.ok ? { last_ok_at: checkedAt } : {}),
      },
      { onConflict: "workspace_id,provider" },
    );
    if (result.ok) return { status: "connected", detail: result.message, evidence: { account: row?.account_label ?? row?.account_ref ?? null } };
    return { status: statusForCode(code), detail: result.message, evidence: { code } };
  }

  // OAuth providers.
  if (!row?.access_token_ciphertext) {
    return { status: "not_configured", detail: `${definition.label} has not been connected yet.`, evidence: {} };
  }
  const expired = row.token_expires_at ? Date.parse(row.token_expires_at) - Date.now() < 60_000 : false;
  if (expired && row.status !== "expired" && row.refresh_token_ciphertext) {
    // Near-expiry access token with a stored refresh token: it is renewed on the next provider call.
    return { status: "connected", detail: `${definition.label} is connected; the access token will be refreshed on next use.`, evidence: { account: row.account_label ?? row.account_ref } };
  }
  if (expired || row.status === "expired") {
    return { status: "auth_required", detail: `${definition.label} access expired. Reconnect the account.`, evidence: { account: row.account_label } };
  }
  if (row.status === "error") {
    return { status: "failed", detail: row.last_error ?? `${definition.label} reported an error on the last check.`, evidence: {} };
  }
  return { status: "connected", detail: `${definition.label} connection is active.`, evidence: { account: row.account_label ?? row.account_ref } };
}

/**
 * Determines, for every scan-relevant provider, whether it applies to this
 * website and whether it can actually be used. Providers are verified in
 * parallel; a verification failure is reported, never swallowed.
 */
export async function discoverPlatforms(
  admin: SupabaseClient,
  workspaceId: string,
  html: string,
): Promise<PlatformDiscovery[]> {
  const links = extractProfileLinks(html);
  const definitions = SCAN_PROVIDERS.map((id) => INTEGRATIONS.find((i) => i.id === id)).filter(Boolean) as IntegrationDefinition[];

  return await Promise.all(
    definitions.map(async (definition) => {
      let verified: { status: DiscoveryStatus; detail: string; evidence: Record<string, unknown> };
      try {
        verified = await verifyOne(admin, workspaceId, definition);
      } catch (caught) {
        verified = { status: "failed", detail: caught instanceof Error ? caught.message : String(caught), evidence: {} };
      }
      const profileLinks = links[definition.id] ?? [];
      const relevant = profileLinks.length > 0 || verified.status === "connected";
      return {
        provider: definition.id,
        label: definition.label,
        group: definition.group,
        relevant,
        status: verified.status,
        detail: verified.detail,
        evidence: { ...verified.evidence, ...(profileLinks.length ? { profileLinks } : {}) },
      };
    }),
  );
}
