import { decryptSecret, encryptSecret } from "./google-business.server";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";
const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
/** Every Google call is bounded, so a hung connection fails that request instead of hanging the sync. */
export const GOOGLE_TIMEOUT_MS = 20_000;

type Connection = { access_token_ciphertext: string; refresh_token_ciphertext: string; token_expires_at: string };
export type GoogleLocation = {
  externalRef: string;
  name: string;
  city: string;
  country: string;
  account: string;
  resource: string;
  /**
   * The place id Google returned for this location, kept separate from
   * `externalRef` because `externalRef` falls back to the resource name. Only a
   * real place id can be turned into a link, so the two must not be confused.
   */
  placeId: string | null;
};
export type GoogleReview = { id: string; author: string; rating: number; body: string; createdAt: string; reply: { text: string; publishedAt: string | null } | null };

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export const BUSINESS_MANAGE_SCOPE = "https://www.googleapis.com/auth/business.manage";

/** Shown whenever Google granted sign-in but not the Business Profile permission. */
export const MISSING_BUSINESS_SCOPE_MESSAGE = "Google did not grant Business Profile permission — reconnect and allow 'See, edit, create and delete your Google business listings'";

/** True only when the granted scopes include business.manage. */
export function hasBusinessScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.some((scope) => String(scope).trim() === BUSINESS_MANAGE_SCOPE);
}

/**
 * A failure meaning the stored Google connection cannot be used as it is, so it
 * must stop being reported as connected. `kind` says why.
 */
export class GoogleConnectionUnusableError extends Error {
  constructor(public kind: "scope_insufficient" | "api_not_approved" | "token_expired", message: string) {
    super(message);
    this.name = "GoogleConnectionUnusableError";
  }
}

/** Classifies a Google 403 response body. Pure, so it is testable without a network call. */
export function classifyGoogle403(body: unknown): GoogleConnectionUnusableError {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes|insufficientPermissions/i.test(text)) {
    return new GoogleConnectionUnusableError("scope_insufficient", MISSING_BUSINESS_SCOPE_MESSAGE);
  }
  return new GoogleConnectionUnusableError("api_not_approved", "Google Business Profile API access has not been approved for this OAuth client.");
}

/**
 * Records that the stored connection cannot be used, so neither the settings
 * screen nor the sync button keeps presenting it as connected. Only status
 * values the google_business_connections CHECK constraint allows are written.
 */
export async function markGoogleConnectionUnusable(admin: any, workspaceId: string, message: string) {
  await admin.from("google_business_connections").update({ status: "needs_reconnect", last_error: message }).eq("workspace_id", workspaceId);
  await admin.from("connected_platforms").update({ status: "disconnected", last_sync_error: message }).eq("workspace_id", workspaceId).eq("platform", "google");
}

export type GoogleBusinessState = {
  code: "CONNECTED" | "NOT_CONFIGURED" | "APPROVAL_REQUIRED" | "AUTHENTICATION_FAILED" | "PROVIDER_ERROR" | "RATE_LIMITED" | "INSUFFICIENT_SCOPE";
  message: string;
};

const APPROVAL_PATTERN = /not been approved|has not been used in project|is disabled|not enabled|accessNotConfigured|quota/i;

/**
 * The single truthful status for a stored Google Business connection. It is
 * CONNECTED only when the Business Profile permission was granted and no call
 * since has failed; holding OAuth tokens alone is not "connected", because
 * Google can still refuse every Business Profile request until it approves the
 * project. Proof comes from probeGoogleBusinessAccess or a successful sync.
 */
export function googleBusinessState(row: { status?: string | null; scopes?: unknown; last_error?: string | null } | null | undefined): GoogleBusinessState {
  if (!row || row.status === "revoked") return { code: "NOT_CONFIGURED", message: "Google Business Profile is not connected yet." };
  const error = typeof row.last_error === "string" && row.last_error.trim() ? row.last_error.trim() : null;
  if (!hasBusinessScope(row.scopes)) {
    return { code: "INSUFFICIENT_SCOPE", message: error && error !== MISSING_BUSINESS_SCOPE_MESSAGE ? `${MISSING_BUSINESS_SCOPE_MESSAGE}. Last Google error: ${error}` : MISSING_BUSINESS_SCOPE_MESSAGE };
  }
  if (error) {
    if (APPROVAL_PATTERN.test(error)) return { code: "APPROVAL_REQUIRED", message: error };
    if (/rate limit|429/i.test(error)) return { code: "RATE_LIMITED", message: error };
    if (/scope|permission/i.test(error)) return { code: "INSUFFICIENT_SCOPE", message: error };
    if (/expired|reconnect|invalid_grant|401/i.test(error)) return { code: "AUTHENTICATION_FAILED", message: error };
    return { code: "PROVIDER_ERROR", message: error };
  }
  if (row.status === "needs_reconnect") return { code: "AUTHENTICATION_FAILED", message: "Google Business Profile needs to be reconnected." };
  return { code: "CONNECTED", message: "Google Business Profile returned authorized data." };
}

/**
 * One real Business Profile call (list accounts) with the given token. Used
 * right after authorization and by the connection test, so "connected" is only
 * ever recorded once Google has actually answered with authorized data.
 */
export async function probeGoogleBusinessAccess(accessToken: string): Promise<GoogleBusinessState & { httpStatus: number }> {
  const response = await fetch(`${ACCOUNTS_API}/accounts?pageSize=1`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  if (response.ok) return { code: "CONNECTED", message: "Google Business Profile returned authorized data.", httpStatus: response.status };
  const body = await response.text().catch(() => "");
  if (response.status === 403) {
    const failure = classifyGoogle403(body);
    return { code: failure.kind === "scope_insufficient" ? "INSUFFICIENT_SCOPE" : "APPROVAL_REQUIRED", message: failure.message, httpStatus: 403 };
  }
  if (response.status === 401) return { code: "AUTHENTICATION_FAILED", message: "Google rejected the access token (401). Reconnect the account.", httpStatus: 401 };
  if (response.status === 429) return { code: "RATE_LIMITED", message: "Google Business Profile rate limit reached (429). Try again later.", httpStatus: 429 };
  return { code: "PROVIDER_ERROR", message: `Google Business Profile request failed (${response.status}).`, httpStatus: response.status };
}

/**
 * Brings every stored Google Business connection in line with what Google
 * actually answers right now, so no screen keeps showing a connection that
 * cannot read reviews. Runs from the scheduled job runner.
 *
 * - No business.manage scope: recorded as needing reconnection (no call made —
 *   Google would refuse it).
 * - Scope present: one real accounts call decides the state; CONNECTED is only
 *   written when Google returned authorized data.
 * Tokens and connection rows are never deleted.
 */
export async function reconcileGoogleConnections(admin: any) {
  const { data: rows, error } = await admin
    .from("google_business_connections")
    .select("workspace_id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,status,scopes,last_error")
    .neq("status", "revoked");
  if (error) throw error;
  const results: Array<{ workspaceId: string; code: GoogleBusinessState["code"]; httpStatus: number | null }> = [];
  for (const row of rows ?? []) {
    if (!hasBusinessScope(row.scopes)) {
      await markGoogleConnectionUnusable(admin, row.workspace_id, MISSING_BUSINESS_SCOPE_MESSAGE);
      results.push({ workspaceId: row.workspace_id, code: "INSUFFICIENT_SCOPE", httpStatus: null });
      continue;
    }
    let probe: GoogleBusinessState & { httpStatus: number | null };
    try {
      probe = await probeGoogleBusinessAccess(await usableAccessToken(admin, row.workspace_id, row));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Google check failed.";
      probe = { code: caught instanceof GoogleConnectionUnusableError ? "AUTHENTICATION_FAILED" : "PROVIDER_ERROR", message, httpStatus: null };
    }
    if (probe.code === "CONNECTED") {
      await admin.from("google_business_connections").update({ status: "connected", last_error: null }).eq("workspace_id", row.workspace_id);
      await admin.from("connected_platforms").update({ status: "connected", last_sync_error: null }).eq("workspace_id", row.workspace_id).eq("platform", "google");
    } else {
      await admin.from("google_business_connections").update({ last_error: probe.message }).eq("workspace_id", row.workspace_id);
      await admin.from("connected_platforms").update({ status: "error", last_sync_error: probe.message }).eq("workspace_id", row.workspace_id).eq("platform", "google");
    }
    results.push({ workspaceId: row.workspace_id, code: probe.code, httpStatus: probe.httpStatus });
  }
  return results;
}

async function googleGet(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  if (response.status === 403) throw classifyGoogle403(await response.text().catch(() => ""));
  if (response.status === 429) throw new Error("Google Business Profile rate limit reached (429). Try again later.");
  if (!response.ok) throw new Error(`Google Business Profile request failed (${response.status}).`);
  return (await response.json()) as Record<string, any>;
}

export async function usableAccessToken(admin: any, workspaceId: string, connection: Connection) {
  if (Date.parse(connection.token_expires_at) - Date.now() > 120_000) {
    return decryptSecret(connection.access_token_ciphertext);
  }
  const { loadProviderCredentials } = await import("./integrations/credentials.server");
  const creds = await loadProviderCredentials(admin, workspaceId, "google_business");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: await decryptSecret(connection.refresh_token_ciphertext),
      client_id: creds["GOOGLE_BUSINESS_CLIENT_ID"] ?? requiredEnv("GOOGLE_BUSINESS_CLIENT_ID"),
      client_secret: creds["GOOGLE_BUSINESS_CLIENT_SECRET"] ?? requiredEnv("GOOGLE_BUSINESS_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof payload["access_token"] !== "string") {
    // The refresh token no longer works, so the connection is unusable until the
    // owner reconnects. Recorded so the UI stops reporting it as connected.
    const message = "Google access expired. Reconnect the account.";
    await markGoogleConnectionUnusable(admin, workspaceId, message);
    throw new GoogleConnectionUnusableError("token_expired", message);
  }
  await admin.from("google_business_connections").update({
    access_token_ciphertext: await encryptSecret(payload["access_token"]),
    token_expires_at: new Date(Date.now() + (typeof payload["expires_in"] === "number" ? payload["expires_in"] : 3600) * 1000).toISOString(),
  }).eq("workspace_id", workspaceId);
  // Status and last_error are left alone: a fresh access token says nothing about
  // whether Google has approved Business Profile access, so it must not clear an
  // approval or scope error recorded by an earlier call.
  return payload["access_token"];
}

async function accounts(token: string) {
  const result: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ACCOUNTS_API}/accounts`);
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await googleGet(url.toString(), token);
    for (const account of (payload["accounts"] ?? []) as Array<{ name?: string }>) if (account.name) result.push(account.name);
    pageToken = typeof payload["nextPageToken"] === "string" ? payload["nextPageToken"] : undefined;
  } while (pageToken && result.length < 100);
  return result;
}

async function locations(account: string, token: string) {
  const result: GoogleLocation[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${INFO_API}/${account}/locations`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("readMask", "name,title,storefrontAddress,metadata");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await googleGet(url.toString(), token);
    for (const row of (payload["locations"] ?? []) as Array<Record<string, any>>) {
      const resource = typeof row["name"] === "string" ? row["name"] : "";
      if (!resource) continue;
      const address = row["storefrontAddress"] ?? {};
      const placeId = typeof row["metadata"]?.["placeId"] === "string" ? row["metadata"]["placeId"] : null;
      result.push({
        externalRef: placeId ?? resource,
        name: row["title"] ?? "Google Business location",
        city: address["locality"] ?? "Unknown city",
        country: address["regionCode"] ?? "Unknown country",
        account,
        resource,
        placeId,
      });
    }
    pageToken = typeof payload["nextPageToken"] === "string" ? payload["nextPageToken"] : undefined;
  } while (pageToken && result.length < 200);
  return result;
}

async function reviews(location: GoogleLocation, token: string, limit: number) {
  const result: GoogleReview[] = [];
  const locationId = location.resource.split("/").pop();
  if (!locationId) return result;
  let pageToken: string | undefined;
  do {
    const url = new URL(`${REVIEWS_API}/${location.account}/locations/${locationId}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const payload = await googleGet(url.toString(), token);
    for (const row of (payload["reviews"] ?? []) as Array<Record<string, any>>) {
      const reviewId = row["reviewId"] ?? row["name"];
      if (!reviewId) continue;
      result.push({
        id: `gbp:${locationId}:${reviewId}`,
        author: row["reviewer"]?.["displayName"] ?? "Google user",
        rating: STARS[row["starRating"] as string] ?? 0,
        // A rating-only review has no comment; it is stored as empty text, not a
        // sentence the reviewer never wrote.
        body: typeof row["comment"] === "string" ? row["comment"] : "",
        createdAt: row["createTime"] ?? "",
        reply: typeof row["reviewReply"]?.["comment"] === "string" ? { text: row["reviewReply"]["comment"], publishedAt: row["reviewReply"]["updateTime"] ?? null } : null,
      });
      if (result.length >= limit) return result;
    }
    pageToken = typeof payload["nextPageToken"] === "string" ? payload["nextPageToken"] : undefined;
  } while (pageToken);
  return result;
}

/**
 * Publishes a public reply to one Google review. `externalId` is the stored
 * `gbp:<locationId>:<reviewId>` reference; the owning account is resolved from Google.
 */
export async function postGoogleReviewReply(token: string, externalId: string, comment: string) {
  const parts = externalId.split(":");
  if (parts[0] !== "gbp" || parts.length < 3) throw new Error("This review did not come from Google Business Profile.");
  const locationId = parts[1];
  const reviewId = parts.slice(2).join(":");
  let lastStatus = 0;
  for (const account of await accounts(token)) {
    const response = await fetch(`${REVIEWS_API}/${account}/locations/${locationId}/reviews/${reviewId}/reply`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ comment }),
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
    if (response.ok) return true;
    lastStatus = response.status;
    if (response.status !== 404 && response.status !== 403) {
      throw new Error(`Google rejected the reply (${response.status}).`);
    }
  }
  throw new Error(`Google did not accept the reply${lastStatus ? ` (${lastStatus})` : ""}.`);
}

/**
 * Rechecks from the live API whether one Google review is still published.
 * true: Google returned the review. false: the location's reviews are readable
 * but this review is gone (404). null: nothing could be observed, which proves
 * nothing either way.
 */
export async function googleReviewVisible(token: string, externalId: string): Promise<{ visible: boolean | null; detail: string }> {
  const parts = externalId.split(":");
  if (parts[0] !== "gbp" || parts.length < 3) return { visible: null, detail: "The review has no Google Business Profile reference." };
  const locationId = parts[1];
  const reviewId = parts.slice(2).join(":");
  for (const account of await accounts(token)) {
    const listing = await fetch(`${REVIEWS_API}/${account}/locations/${locationId}/reviews?pageSize=1`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    if (!listing.ok) continue;
    const path = `${account}/locations/${locationId}/reviews/${reviewId}`;
    const response = await fetch(`${REVIEWS_API}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
    if (response.ok) return { visible: true, detail: `Google Business Profile API GET ${path} returned ${response.status}` };
    if (response.status === 404) return { visible: false, detail: `Google Business Profile API GET ${path} returned 404 while the location's reviews were readable` };
    return { visible: null, detail: `Google returned ${response.status} for the review` };
  }
  return { visible: null, detail: "No connected Google account could read this review's location." };
}

/**
 * Upper bound on reviews read per location. `reviews()` follows nextPageToken
 * until the pages run out or this bound is hit, so one sync cannot run unbounded.
 */
export const MAX_REVIEWS_PER_LOCATION = 5000;

export async function fetchGoogleReviews(token: string, perLocation = MAX_REVIEWS_PER_LOCATION) {
  const result: Array<{ location: GoogleLocation; reviews: GoogleReview[] }> = [];
  for (const account of await accounts(token)) {
    for (const location of await locations(account, token)) result.push({ location, reviews: await reviews(location, token, perLocation) });
  }
  return result;
}