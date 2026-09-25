/**
 * Provider-agnostic review pipeline: normalization, shared storage, truthful
 * provider status and the hand-off into the removal engine.
 *
 * Unit tests only. Provider payload fixtures are shaped like each API's
 * documented response and are never written anywhere; storage runs against an
 * in-memory table stub, not the database.
 *
 * Run with: bun test tests/
 */

import { describe, expect, test } from "bun:test";
import { normalizeGoogleReview, normalizeTrustpilotReview, storedBody, validateNormalized } from "../src/lib/reviews/normalized";
import { ingestNormalizedReviews } from "../src/lib/reviews/ingest.server";
import { BUSINESS_MANAGE_SCOPE, googleBusinessState } from "../src/lib/google-business-sync.server";
import { outcomeFor } from "../src/lib/integrations/providers.server";
import { resolveStoredReviewUrl } from "../src/lib/removal/review-url";
import { detectRoutes } from "../src/lib/removal/routes";

const GOOGLE_PLACE_LINK = "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4";

describe("normalization — Google", () => {
  test("maps a written review with the business reply", () => {
    const result = normalizeGoogleReview(
      { id: "gbp:123:abc", author: "A. Reviewer", rating: 1, body: "Rude staff.", createdAt: "2026-09-01T10:00:00Z", reply: { text: "Sorry to hear this.", publishedAt: "2026-09-02T10:00:00Z" } },
      { locationName: "Main St", reviewUrl: GOOGLE_PLACE_LINK },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review).toMatchObject({ platform: "google", source: "google_business", externalId: "gbp:123:abc", rating: 1, body: "Rude staff.", reviewUrl: GOOGLE_PLACE_LINK });
    expect(result.review.reply).toEqual({ text: "Sorry to hear this.", publishedAt: "2026-09-02T10:00:00Z" });
  });

  test("a rating-only review keeps empty text instead of an invented sentence", () => {
    const result = normalizeGoogleReview({ id: "gbp:1:r", author: "", rating: 5, body: "", createdAt: "2026-09-01T10:00:00Z", reply: null }, { locationName: "L", reviewUrl: null });
    expect(result.ok && result.review.body).toBe("");
    expect(result.ok && result.review.author).toBe("Google user");
  });

  test("rows that cannot be identified, rated or dated are rejected, not patched", () => {
    const base = { id: "gbp:1:r", author: "x", rating: 3, body: "ok", createdAt: "2026-09-01T10:00:00Z", reply: null };
    expect(normalizeGoogleReview({ ...base, id: "" }, { locationName: "L", reviewUrl: null })).toEqual({ ok: false, reason: "provider review id missing" });
    expect(normalizeGoogleReview({ ...base, rating: 0 }, { locationName: "L", reviewUrl: null }).ok).toBe(false);
    expect(normalizeGoogleReview({ ...base, createdAt: "" }, { locationName: "L", reviewUrl: null }).ok).toBe(false);
    expect(normalizeGoogleReview(base, { locationName: "L", reviewUrl: "http://insecure.example" }).ok).toBe(false);
  });
});

describe("normalization — Trustpilot", () => {
  const raw = {
    id: "5f1a2b3c4d5e6f7a8b9c0d1e",
    stars: 2,
    title: "Never again",
    text: "Order never arrived.",
    createdAt: "2026-08-20T09:00:00Z",
    consumer: { displayName: "J. Doe" },
    links: [
      { href: "https://api.trustpilot.com/v1/reviews/5f1a2b3c4d5e6f7a8b9c0d1e", rel: "reviews" },
      { href: "https://www.trustpilot.com/reviews/5f1a2b3c4d5e6f7a8b9c0d1e", rel: "public" },
    ],
  };

  test("maps title, text and the public link the payload itself carries", () => {
    const result = normalizeTrustpilotReview(raw, { locationName: "example.com" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review).toMatchObject({ platform: "trustpilot", source: "trustpilot", externalId: raw.id, rating: 2, title: "Never again", author: "J. Doe" });
    expect(result.review.reviewUrl).toBe("https://www.trustpilot.com/reviews/5f1a2b3c4d5e6f7a8b9c0d1e");
    expect(storedBody(result.review)).toBe("Never again — Order never arrived.");
  });

  test("no public link in the payload means no link — none is constructed", () => {
    const result = normalizeTrustpilotReview({ ...raw, links: [raw.links[0]] }, { locationName: "example.com" });
    expect(result.ok && result.review.reviewUrl).toBeNull();
  });

  test("a review without a date is rejected instead of being stamped with the sync time", () => {
    expect(normalizeTrustpilotReview({ ...raw, createdAt: undefined }, { locationName: "x" }).ok).toBe(false);
  });

  test("both providers produce the same shape", () => {
    const g = normalizeGoogleReview({ id: "g1", author: "a", rating: 2, body: "b", createdAt: "2026-09-01T10:00:00Z", reply: null }, { locationName: "L", reviewUrl: null });
    const t = normalizeTrustpilotReview(raw, { locationName: "L" });
    expect(g.ok && t.ok).toBe(true);
    if (!g.ok || !t.ok) return;
    expect(Object.keys(g.review).sort()).toEqual(Object.keys(t.review).sort());
    expect(validateNormalized(g.review).ok && validateNormalized(t.review).ok).toBe(true);
  });
});

/** Minimal in-memory stand-in for the Supabase query builder calls ingest uses. */
function memoryClient() {
  const tables: Record<string, any[]> = { reviews: [], alerts: [] };
  const calls: string[] = [];
  let seq = 0;
  const builder = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const inFilters: Array<[string, unknown[]]> = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: any = null;
    const rows = () =>
      tables[table]!.filter((row) => filters.every(([k, v]) => row[k] === v) && inFilters.every(([k, vs]) => vs.includes(row[k])));
    const api: any = {
      select: () => (calls.push(`${table}.select`), api),
      eq: (k: string, v: unknown) => (filters.push([k, v]), api),
      in: (k: string, vs: unknown[]) => (inFilters.push([k, vs]), api),
      limit: () => api,
      update: (p: any) => ((op = "update"), (payload = p), api),
      insert: (p: any) => ((op = "insert"), (payload = p), api),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        const row = { id: `row-${++seq}`, ...payload };
        tables[table]!.push(row);
        return { data: row, error: null };
      },
      then: (resolve: any) => {
        if (op === "update") for (const row of rows()) Object.assign(row, payload);
        if (op === "insert") tables[table]!.push({ id: `row-${++seq}`, ...payload });
        return Promise.resolve({ data: op === "select" ? rows() : null, error: null }).then(resolve);
      },
    };
    return api;
  };
  return { tables, calls, client: { from: builder } };
}

describe("shared storage", () => {
  const google = normalizeGoogleReview({ id: "gbp:1:bad", author: "A", rating: 1, body: "Scam business.", createdAt: "2026-09-01T10:00:00Z", reply: null }, { locationName: "Main St", reviewUrl: GOOGLE_PLACE_LINK });
  const trustpilot = normalizeTrustpilotReview({ id: "tp1", stars: 5, text: "Great", createdAt: "2026-09-02T10:00:00Z", consumer: { displayName: "B" } }, { locationName: "example.com" });
  const broken = normalizeGoogleReview({ id: "", author: "A", rating: 1, body: "x", createdAt: "2026-09-01T10:00:00Z", reply: null }, { locationName: "L", reviewUrl: null });

  test("stores every provider through one path, alerts once, skips rejected rows", async () => {
    const { tables, client } = memoryClient();
    const first = await ingestNormalizedReviews(client, { workspaceId: "w1", results: [google, trustpilot, broken], negativeThreshold: 2, platformLabel: "Mixed" });
    expect(first).toMatchObject({ found: 2, created: 2, updated: 0, alerts: 1 });
    expect(first.rejected).toEqual([{ reason: "provider review id missing" }]);
    expect(tables.reviews.map((r) => r.platform).sort()).toEqual(["google", "trustpilot"]);

    const second = await ingestNormalizedReviews(client, { workspaceId: "w1", results: [google, trustpilot], negativeThreshold: 2, platformLabel: "Mixed" });
    expect(second).toMatchObject({ created: 0, updated: 2, alerts: 0 });
    expect(tables.reviews).toHaveLength(2);
    expect(tables.alerts).toHaveLength(1);
  });

  test("existence lookups are batched per chunk, not one per review, with identical results", async () => {
    const { tables, calls, client } = memoryClient();
    const many = Array.from({ length: 120 }, (_, i) =>
      normalizeGoogleReview({ id: `gbp:1:r${i}`, author: "A", rating: i % 2 === 0 ? 1 : 5, body: `text ${i}`, createdAt: "2026-09-01T10:00:00Z", reply: null }, { locationName: "L", reviewUrl: null }),
    );
    // The same provider id twice in one batch: stored once, updated once, alerted once.
    const withRepeat = [...many, many[0]!];
    const first = await ingestNormalizedReviews(client, { workspaceId: "w1", results: withRepeat, negativeThreshold: 2, platformLabel: "Google" });
    expect(first).toMatchObject({ found: 121, created: 120, updated: 1, alerts: 60 });
    expect(tables.reviews).toHaveLength(120);
    expect(tables.alerts).toHaveLength(60);
    // 120 ids / 50 per chunk = 3 review lookups; 60 negative ids / 100 = 1 alert lookup.
    const lookups = calls.length;
    const second = await ingestNormalizedReviews(client, { workspaceId: "w1", results: many, negativeThreshold: 2, platformLabel: "Google" });
    expect(second).toMatchObject({ found: 120, created: 0, updated: 120, alerts: 0 });
    expect(calls.length - lookups).toBe(4);
    expect(tables.alerts).toHaveLength(60);
    // Another workspace with the same provider ids is a separate set of rows.
    const other = await ingestNormalizedReviews(client, { workspaceId: "w2", results: many.slice(0, 2), negativeThreshold: 2, platformLabel: "Google" });
    expect(other).toMatchObject({ created: 2, updated: 0, alerts: 1 });
  });

  test("a stored review of any platform enters the removal engine with the right link precision and routes", () => {
    for (const [platform, url, precision] of [
      ["google", GOOGLE_PLACE_LINK, "location_reviews"],
      ["trustpilot", "https://www.trustpilot.com/reviews/5f1a2b3c4d5e6f7a8b9c0d1e", "review_permalink"],
    ] as const) {
      expect(resolveStoredReviewUrl({ platform, storedUrl: url }).precision).toBe(precision);
      const routes = detectRoutes({ platform, violation: "hate_or_harassment", capability: { providerApiApproved: false, legalSourceConnected: false } });
      expect(routes.some((route: any) => route.route === "platform_policy_report")).toBe(true);
    }
  });
});

describe("truthful provider status", () => {
  const scopes = ["openid", "https://www.googleapis.com/auth/userinfo.email", BUSINESS_MANAGE_SCOPE];

  test("the live row today (sign-in scopes only) is INSUFFICIENT_SCOPE, never CONNECTED", () => {
    const state = googleBusinessState({ status: "connected", scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email"], last_error: "Google Business Profile API access has not been approved for this OAuth client." });
    expect(state.code).toBe("INSUFFICIENT_SCOPE");
    expect(state.message).toContain("not been approved");
  });

  test("scope granted but Google has not approved the API is APPROVAL_REQUIRED", () => {
    expect(googleBusinessState({ status: "needs_reconnect", scopes, last_error: "Google Business Profile API access has not been approved for this OAuth client." }).code).toBe("APPROVAL_REQUIRED");
  });

  test("CONNECTED only with the scope and no failed call since", () => {
    expect(googleBusinessState({ status: "connected", scopes, last_error: null }).code).toBe("CONNECTED");
    expect(googleBusinessState(null).code).toBe("NOT_CONFIGURED");
    expect(googleBusinessState({ status: "revoked", scopes, last_error: null }).code).toBe("NOT_CONFIGURED");
    expect(googleBusinessState({ status: "needs_reconnect", scopes, last_error: "Google access expired. Reconnect the account." }).code).toBe("AUTHENTICATION_FAILED");
    expect(googleBusinessState({ status: "connected", scopes, last_error: "Google Business Profile rate limit reached (429). Try again later." }).code).toBe("RATE_LIMITED");
    expect(googleBusinessState({ status: "connected", scopes, last_error: "Google Business Profile request failed (500)." }).code).toBe("PROVIDER_ERROR");
  });

  test("HTTP outcomes map to the agreed codes", () => {
    expect(outcomeFor(true, 200, "")).toBe("CONNECTED");
    expect(outcomeFor(false, 0, "No Trustpilot API key is configured.")).toBe("NOT_CONFIGURED");
    expect(outcomeFor(false, 401, "")).toBe("AUTHENTICATION_FAILED");
    expect(outcomeFor(false, 403, "Request had insufficient authentication scopes.")).toBe("INSUFFICIENT_SCOPE");
    expect(outcomeFor(false, 403, "Requests to this API ... are blocked.")).toBe("APPROVAL_REQUIRED");
    expect(outcomeFor(false, 403, "Forbidden")).toBe("AUTHENTICATION_FAILED");
    expect(outcomeFor(false, 429, "")).toBe("RATE_LIMITED");
    expect(outcomeFor(false, 500, "")).toBe("PROVIDER_ERROR");
  });
});
