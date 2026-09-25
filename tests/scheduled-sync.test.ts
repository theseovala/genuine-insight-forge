/**
 * Scheduled review sync and Google discovery robustness.
 *
 * Unit tests only: the database is an in-memory table stub and every Google
 * call goes to an in-memory fetch stub. No row is written to any real
 * database, no provider is contacted, and the payloads below are shaped like
 * Google's documented responses — they are test fixtures, never stored.
 *
 * Run with: bun test tests/
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  BUSINESS_MANAGE_SCOPE,
  MAX_GOOGLE_ACCOUNTS,
  MAX_LOCATIONS_PER_ACCOUNT,
  NO_GOOGLE_LOCATIONS_MESSAGE,
  discoverGoogleReviews,
  googleBusinessState,
  runGoogleReviewSync,
} from "../src/lib/google-business-sync.server";
import { encryptSecret } from "../src/lib/google-business.server";
import { STALE_SYNC_MESSAGE, SYNC_RUN_STALE_MS, publicSyncSummary, runScheduledReviewSyncs } from "../src/lib/reviews/scheduled-sync.server";

// Only used to encrypt a placeholder token inside this process.
process.env["GOOGLE_BUSINESS_TOKEN_ENCRYPTION_KEY"] ??= "unit-test-only-key";
process.env["GOOGLE_BUSINESS_CLIENT_ID"] ??= "unit-test-client";
process.env["GOOGLE_BUSINESS_CLIENT_SECRET"] ??= "unit-test-secret";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ACCOUNTS = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO = "https://mybusinessbusinessinformation.googleapis.com/v1/";
const REVIEWS = "https://mybusiness.googleapis.com/v4/";

type Route = (url: URL) => { status: number; body: unknown } | undefined;

/** Routes every fetch to an in-memory answer; anything unrouted fails the test. */
function stubFetch(route: Route) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    calls.push(url.toString());
    const answer = route(url);
    if (!answer) throw new Error(`Unexpected fetch in unit test: ${url.origin}${url.pathname}`);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

/** In-memory stand-in for the Supabase query builder calls the sync code uses. */
function memoryDb(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  const writes: Array<{ table: string; op: "insert" | "update"; filters: Record<string, unknown> }> = [];
  let seq = 0;
  const defaults = (table: string) => (table === "sync_runs" ? { status: "running", started_at: new Date().toISOString() } : {});
  const from = (table: string) => {
    tables[table] ??= [];
    const eqs: Array<[string, unknown]> = [];
    const neqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: any = null;
    let limit: number | null = null;
    const match = (row: any) => eqs.every(([k, v]) => row[k] === v) && neqs.every(([k, v]) => row[k] !== v) && ins.every(([k, vs]) => vs.includes(row[k]));
    const exec = () => {
      if (op === "insert") {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((p: any) => ({ id: `row-${++seq}`, ...defaults(table), ...p }));
        tables[table]!.push(...rows);
        writes.push({ table, op, filters: {} });
        return rows;
      }
      if (op === "update") {
        const rows = tables[table]!.filter(match);
        for (const row of rows) Object.assign(row, payload);
        writes.push({ table, op, filters: Object.fromEntries(eqs) });
        return rows;
      }
      const rows = tables[table]!.filter(match);
      return limit === null ? rows : rows.slice(0, limit);
    };
    const api: any = {
      select: () => api,
      order: () => api,
      eq: (k: string, v: unknown) => (eqs.push([k, v]), api),
      neq: (k: string, v: unknown) => (neqs.push([k, v]), api),
      in: (k: string, vs: unknown[]) => (ins.push([k, vs]), api),
      limit: (n: number) => ((limit = n), api),
      insert: (p: any) => ((op = "insert"), (payload = p), api),
      update: (p: any) => ((op = "update"), (payload = p), api),
      maybeSingle: async () => ({ data: exec()[0] ?? null, error: null }),
      single: async () => ({ data: exec()[0] ?? null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve({ data: exec(), error: null }).then(resolve, reject),
    };
    return api;
  };
  return { tables, writes, client: { from } };
}

const location = (resource: string, title: string, placeId: string | null) => ({ name: resource, title, storefrontAddress: { locality: "Leeds", regionCode: "GB" }, ...(placeId ? { metadata: { placeId } } : {}) });
const review = (id: string, stars: string, comment?: string) => ({ reviewId: id, reviewer: { displayName: `Reviewer ${id}` }, starRating: stars, ...(comment ? { comment } : {}), createTime: "2026-09-01T10:00:00Z" });

describe("Google discovery", () => {
  test("a location listed under several accounts (same resource or same place id) is read and stored once", async () => {
    const calls = stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) return { status: 200, body: { accounts: [{ name: "accounts/A" }, { name: "accounts/B" }, { name: "accounts/A" }] } };
      if (url.href.startsWith(`${INFO}accounts/A/locations`)) return { status: 200, body: { locations: [location("locations/1", "Main St", "PLACE1")] } };
      if (url.href.startsWith(`${INFO}accounts/B/locations`)) return { status: 200, body: { locations: [location("locations/1", "Main St", "PLACE1"), location("locations/7", "Main St (group copy)", "PLACE1"), location("locations/2", "High St", null)] } };
      if (url.href.startsWith(REVIEWS)) return { status: 200, body: { reviews: [review("r1", "FIVE", "Great")] } };
    });
    const discovery = await discoverGoogleReviews("token");
    expect(discovery.accounts).toBe(2);
    expect(discovery.batches.map((batch) => batch.location.resource)).toEqual(["locations/1", "locations/2"]);
    expect(discovery.duplicateLocations).toBe(2);
    expect(discovery.truncated).toEqual([]);
    // Reviews were read once per distinct location, not once per listing.
    expect(calls.filter((call) => call.startsWith(REVIEWS))).toHaveLength(2);
  });

  test("zero locations is an empty result, not an error and not invented data", async () => {
    stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) return { status: 200, body: { accounts: [{ name: "accounts/A" }] } };
      if (url.href.startsWith(INFO)) return { status: 200, body: {} };
    });
    const discovery = await discoverGoogleReviews("token");
    expect(discovery.batches).toEqual([]);
    expect(discovery.truncated).toEqual([]);
  });

  test("every cap that cut off data is reported, not silently dropped", async () => {
    let accountPage = 0;
    stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) {
        accountPage += 1;
        return { status: 200, body: { accounts: Array.from({ length: 20 }, (_, i) => ({ name: `accounts/${accountPage}-${i}` })), nextPageToken: `p${accountPage}` } };
      }
      if (url.href.startsWith(`${INFO}accounts/1-0/locations`)) {
        const page = Number(url.searchParams.get("pageToken") ?? "0");
        return { status: 200, body: { locations: Array.from({ length: 100 }, (_, i) => location(`locations/${page * 100 + i}`, `Loc ${page * 100 + i}`, null)), nextPageToken: String(page + 1) } };
      }
      if (url.href.startsWith(INFO)) return { status: 200, body: {} };
      if (url.href.startsWith(REVIEWS)) return { status: 200, body: { reviews: [review("a", "ONE"), review("b", "TWO"), review("c", "THREE")], nextPageToken: "more" } };
    });
    const discovery = await discoverGoogleReviews("token", 2);
    expect(discovery.accounts).toBe(MAX_GOOGLE_ACCOUNTS);
    expect(discovery.batches).toHaveLength(MAX_LOCATIONS_PER_ACCOUNT);
    expect(discovery.batches.every((batch) => batch.reviews.length === 2)).toBe(true);
    expect(discovery.truncated[0]).toContain(`first ${MAX_GOOGLE_ACCOUNTS} Google accounts`);
    expect(discovery.truncated[1]).toContain(`first ${MAX_LOCATIONS_PER_ACCOUNT} locations of accounts/1-0`);
    expect(discovery.truncated.filter((line) => line.includes("reviews of"))).toHaveLength(MAX_LOCATIONS_PER_ACCOUNT);
  });

  test("a read that ends exactly at the last review is not reported as truncated", async () => {
    stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) return { status: 200, body: { accounts: [{ name: "accounts/A" }] } };
      if (url.href.startsWith(INFO)) return { status: 200, body: { locations: [location("locations/1", "Main St", null)] } };
      if (url.href.startsWith(REVIEWS)) return { status: 200, body: { reviews: [review("a", "ONE"), review("b", "TWO")] } };
    });
    const discovery = await discoverGoogleReviews("token", 2);
    expect(discovery.batches[0]!.reviews).toHaveLength(2);
    expect(discovery.truncated).toEqual([]);
  });
});

async function googleWorkspace(overrides: Record<string, unknown> = {}) {
  return memoryDb({
    google_business_connections: [
      {
        workspace_id: "w1",
        status: "connected",
        scopes: ["openid", BUSINESS_MANAGE_SCOPE],
        last_error: null,
        access_token_ciphertext: await encryptSecret("placeholder-access-token"),
        refresh_token_ciphertext: await encryptSecret("placeholder-refresh-token"),
        token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        ...overrides,
      },
    ],
    connected_platforms: [{ workspace_id: "w1", platform: "google", status: "connected", last_sync_error: null }],
    reviews: [{ id: "existing", workspace_id: "w1", platform: "google", external_id: "gbp:1:old", body: "Stored earlier", rating: 2 }],
  });
}

describe("runGoogleReviewSync", () => {
  test("zero locations completes with an explicit message and writes no review", async () => {
    const db = await googleWorkspace();
    stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) return { status: 200, body: { accounts: [{ name: "accounts/A" }] } };
      if (url.href.startsWith(INFO)) return { status: 200, body: { locations: [] } };
    });
    const result = await runGoogleReviewSync(db.client, db.client, "w1", "scheduled");
    expect(result).toMatchObject({ locations: 0, reviewsFound: 0, reviewsCreated: 0, trigger: "scheduled" });
    expect(result.notices).toEqual([NO_GOOGLE_LOCATIONS_MESSAGE]);
    expect(db.tables["sync_runs"]![0]).toMatchObject({ status: "completed", locations_found: 0, error_message: NO_GOOGLE_LOCATIONS_MESSAGE });
    expect(db.tables["reviews"]).toHaveLength(1);
    expect(googleBusinessState(db.tables["google_business_connections"]![0]).code).toBe("CONNECTED");
  });

  test("stores reviews with id, location, rating, empty text for rating-only, reviewer, date, reply and place link — every write scoped to the workspace", async () => {
    const db = await googleWorkspace();
    stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) return { status: 200, body: { accounts: [{ name: "accounts/A" }] } };
      if (url.href.startsWith(INFO)) return { status: 200, body: { locations: [location("locations/1", "Main St", "ChIJN1t_tDeuEmsRUsoyG83frY4")] } };
      if (url.href.startsWith(REVIEWS)) {
        return {
          status: 200,
          body: { reviews: [review("r1", "ONE", "Rude"), { ...review("r2", "FIVE"), reviewReply: { comment: "Thanks!", updateTime: "2026-09-03T10:00:00Z" } }] },
        };
      }
    });
    const result = await runGoogleReviewSync(db.client, db.client, "w1", "manual");
    expect(result).toMatchObject({ locations: 1, reviewsFound: 2, reviewsCreated: 2, notices: [] });
    const stored = db.tables["reviews"]!.filter((row) => row.id !== "existing");
    expect(stored[0]).toMatchObject({ external_id: "gbp:1:r1", workspace_id: "w1", location_name: "Main St", rating: 1, body: "Rude", author: "Reviewer r1", external_created_at: "2026-09-01T10:00:00Z", review_url: "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4" });
    expect(stored[1]).toMatchObject({ external_id: "gbp:1:r2", body: "", reply: "Thanks!", replied_at: "2026-09-03T10:00:00Z", status: "replied" });
    for (const write of db.writes.filter((w) => w.op === "update" && ["sync_runs", "locations", "google_business_connections", "connected_platforms"].includes(w.table))) {
      expect(write.filters["workspace_id"]).toBe("w1");
    }
  });

  test("429 fails the run as RATE_LIMITED and leaves stored reviews untouched", async () => {
    const db = await googleWorkspace();
    stubFetch((url) => {
      if (url.href.startsWith(ACCOUNTS)) return { status: 200, body: { accounts: [{ name: "accounts/A" }] } };
      if (url.href.startsWith(INFO)) return { status: 200, body: { locations: [location("locations/1", "Main St", null)] } };
      if (url.href.startsWith(REVIEWS)) return { status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } };
    });
    await expect(runGoogleReviewSync(db.client, db.client, "w1", "scheduled")).rejects.toThrow(/429/);
    expect(db.tables["reviews"]).toEqual([{ id: "existing", workspace_id: "w1", platform: "google", external_id: "gbp:1:old", body: "Stored earlier", rating: 2 }]);
    expect(db.tables["locations"] ?? []).toEqual([]);
    expect(db.tables["sync_runs"]![0]).toMatchObject({ status: "failed" });
    expect(googleBusinessState(db.tables["google_business_connections"]![0]).code).toBe("RATE_LIMITED");
  });

  test("a rejected token (401) is recorded as AUTHENTICATION_FAILED", async () => {
    const db = await googleWorkspace();
    stubFetch((url) => (url.href.startsWith(ACCOUNTS) ? { status: 401, body: {} } : undefined));
    await expect(runGoogleReviewSync(db.client, db.client, "w1", "scheduled")).rejects.toThrow(/401/);
    const row = db.tables["google_business_connections"]![0];
    expect(row.status).toBe("needs_reconnect");
    expect(googleBusinessState(row).code).toBe("AUTHENTICATION_FAILED");
    expect(db.tables["connected_platforms"]![0]).toMatchObject({ status: "disconnected" });
  });

  test("revoked access (invalid_grant on refresh) is AUTHENTICATION_FAILED; a Google 503 at the token endpoint is not", async () => {
    const expired = { token_expires_at: new Date(Date.now() - 60_000).toISOString() };
    const revoked = await googleWorkspace(expired);
    stubFetch((url) => (url.href.startsWith("https://oauth2.googleapis.com/token") ? { status: 400, body: { error: "invalid_grant" } } : undefined));
    await expect(runGoogleReviewSync(revoked.client, revoked.client, "w1", "scheduled")).rejects.toThrow(/Reconnect/);
    expect(googleBusinessState(revoked.tables["google_business_connections"]![0]).code).toBe("AUTHENTICATION_FAILED");

    const outage = await googleWorkspace(expired);
    stubFetch((url) => (url.href.startsWith("https://oauth2.googleapis.com/token") ? { status: 503, body: {} } : undefined));
    await expect(runGoogleReviewSync(outage.client, outage.client, "w1", "scheduled")).rejects.toThrow(/503/);
    const row = outage.tables["google_business_connections"]![0];
    expect(row.status).toBe("connected");
    expect(googleBusinessState(row).code).toBe("PROVIDER_ERROR");
  });

  test("without business.manage no Google call is made and no run is recorded", async () => {
    const db = await googleWorkspace({ scopes: ["openid"] });
    const calls = stubFetch(() => undefined);
    await expect(runGoogleReviewSync(db.client, db.client, "w1", "scheduled")).rejects.toThrow(/Business Profile permission/);
    expect(calls).toEqual([]);
    expect(db.tables["sync_runs"] ?? []).toEqual([]);
    expect(googleBusinessState(db.tables["google_business_connections"]![0]).code).toBe("INSUFFICIENT_SCOPE");
  });
});

describe("scheduled review sync", () => {
  const scope = ["openid", BUSINESS_MANAGE_SCOPE];
  const now = Date.parse("2026-09-25T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  function schedulerDb(extra: Record<string, any[]> = {}) {
    return memoryDb({
      google_business_connections: [
        { workspace_id: "w1", status: "connected", scopes: scope, last_error: null },
        { workspace_id: "w2", status: "connected", scopes: scope, last_error: null },
        // The live state today: sign-in scopes only. Must never be synced.
        { workspace_id: "w3", status: "needs_reconnect", scopes: ["openid"], last_error: "Google did not grant Business Profile permission" },
        { workspace_id: "w4", status: "connected", scopes: scope, last_error: "Google Business Profile API access has not been approved for this OAuth client." },
      ],
      integration_connections: [
        { workspace_id: "w1", provider: "trustpilot", status: "connected", account_ref: "bu-1" },
        { workspace_id: "w2", provider: "trustpilot", status: "connected", account_ref: "bu-2" },
        { workspace_id: "w3", provider: "trustpilot", status: "error", account_ref: "bu-3" },
      ],
      ...extra,
    });
  }

  test("only CONNECTED Google workspaces are synced; one failure never blocks the others", async () => {
    const db = schedulerDb();
    const googleRuns: string[] = [];
    const trustpilotRuns: string[] = [];
    const summary = await runScheduledReviewSyncs(db.client, {
      now: () => now,
      runGoogle: async (workspaceId) => {
        googleRuns.push(workspaceId);
        if (workspaceId === "w1") throw new Error("Google Business Profile rate limit reached (429). Try again later.");
        return { reviewsFound: 4, reviewsCreated: 1, notices: [] };
      },
      runTrustpilot: async (workspaceId) => {
        trustpilotRuns.push(workspaceId);
        if (workspaceId === "w2") throw new Error("Trustpilot sync failed with HTTP 500.");
        return { reviewsFound: 2, reviewsCreated: 2 };
      },
      hasTrustpilotKey: async () => true,
    });
    expect(googleRuns).toEqual(["w1", "w2"]);
    expect(summary.google).toEqual([
      { workspaceId: "w1", status: "failed", detail: "Google Business Profile rate limit reached (429). Try again later." },
      { workspaceId: "w2", status: "synced", detail: "Sync completed.", reviewsFound: 4, reviewsCreated: 1, staleRunsClosed: 0 },
      { workspaceId: "w3", status: "skipped", detail: "INSUFFICIENT_SCOPE" },
      { workspaceId: "w4", status: "skipped", detail: "APPROVAL_REQUIRED" },
    ]);
    expect(trustpilotRuns).toEqual(["w1", "w2"]);
    expect((summary.trustpilot as any[]).map((o) => o.status)).toEqual(["synced", "failed"]);
    // The scheduler itself never changes a connection's state.
    expect(db.writes.filter((w) => w.table === "google_business_connections")).toEqual([]);
  });

  test("single-flight: a running sync younger than 30 minutes is not started twice", async () => {
    const db = schedulerDb({ sync_runs: [{ id: "live", workspace_id: "w1", platform: "google", status: "running", started_at: ago(5 * 60_000) }] });
    const googleRuns: string[] = [];
    const summary = await runScheduledReviewSyncs(db.client, {
      now: () => now,
      runGoogle: async (workspaceId) => (googleRuns.push(workspaceId), { reviewsFound: 0, reviewsCreated: 0 }),
      runTrustpilot: async () => ({ reviewsFound: 0, reviewsCreated: 0 }),
      hasTrustpilotKey: async () => true,
    });
    expect(googleRuns).toEqual(["w2"]);
    expect((summary.google as any[])[0]).toMatchObject({ workspaceId: "w1", status: "skipped" });
    expect(db.tables["sync_runs"]![0].status).toBe("running");
  });

  test("a running row older than 30 minutes is closed as failed with a clear message, then the sync runs", async () => {
    const db = schedulerDb({
      sync_runs: [
        { id: "dead", workspace_id: "w1", platform: "google", status: "running", started_at: ago(SYNC_RUN_STALE_MS + 60_000) },
        // Another workspace's stale row is not touched by w1's check.
        { id: "other", workspace_id: "w9", platform: "google", status: "running", started_at: ago(SYNC_RUN_STALE_MS * 4) },
      ],
    });
    const googleRuns: string[] = [];
    const summary = await runScheduledReviewSyncs(db.client, {
      now: () => now,
      runGoogle: async (workspaceId) => (googleRuns.push(workspaceId), { reviewsFound: 1, reviewsCreated: 0 }),
      runTrustpilot: async () => ({ reviewsFound: 0, reviewsCreated: 0 }),
      hasTrustpilotKey: async () => true,
    });
    expect(googleRuns).toEqual(["w1", "w2"]);
    expect((summary.google as any[])[0]).toMatchObject({ workspaceId: "w1", status: "synced", staleRunsClosed: 1 });
    expect(db.tables["sync_runs"]!.find((row) => row.id === "dead")).toMatchObject({ status: "failed", error_message: STALE_SYNC_MESSAGE, completed_at: new Date(now).toISOString() });
    expect(db.tables["sync_runs"]!.find((row) => row.id === "other")!.status).toBe("running");
  });

  test("Trustpilot without an API key is skipped; a failed provider listing does not stop the other provider", async () => {
    const db = schedulerDb();
    const broken = {
      from: (table: string) => (table === "google_business_connections" ? { select: () => ({ neq: async () => ({ data: null, error: new Error("listing failed") }) }) } : db.client.from(table)),
    };
    const trustpilotRuns: string[] = [];
    const summary = await runScheduledReviewSyncs(broken, {
      now: () => now,
      runGoogle: async () => ({ reviewsFound: 0, reviewsCreated: 0 }),
      runTrustpilot: async (workspaceId) => (trustpilotRuns.push(workspaceId), { reviewsFound: 0, reviewsCreated: 0 }),
      hasTrustpilotKey: async (workspaceId) => workspaceId === "w2",
    });
    expect(summary.google).toEqual({ error: "listing failed" });
    expect(trustpilotRuns).toEqual(["w2"]);
    expect((summary.trustpilot as any[])[0]).toEqual({ workspaceId: "w1", status: "skipped", detail: "No Trustpilot API key is configured." });
  });

  test("the cron response carries no workspace ids", () => {
    const summary = publicSyncSummary({ google: [{ workspaceId: "w1", status: "synced", detail: "Sync completed.", reviewsFound: 1, reviewsCreated: 1 }], trustpilot: { error: "x" } });
    expect(JSON.stringify(summary)).not.toContain("w1");
    expect(summary.google).toEqual([{ status: "synced", detail: "Sync completed.", reviewsFound: 1, reviewsCreated: 1 }]);
  });
});
