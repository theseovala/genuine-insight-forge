/**
 * End-to-end review/removal pipeline, in memory.
 *
 * provider payload -> normalization -> shared ingest (dedupe + alert) -> policy
 * scan -> evidence package + routes -> ledger: submission -> provider response
 * -> recheck -> verified outcome.
 *
 * Nothing here touches the database or a provider. Provider payloads are shaped
 * like each API's documented response and are fixtures, clearly labelled; the
 * model output is a stub. What runs is the production code for every stage.
 *
 * Run with: bun test tests/
 */

import { beforeAll, describe, expect, mock, test } from "bun:test";
import { normalizeGoogleReview, normalizeTrustpilotReview, validateNormalized, type NormalizedReview } from "../src/lib/reviews/normalized";
import { ingestNormalizedReviews } from "../src/lib/reviews/ingest.server";
import {
  appendEntry,
  assertNotFuture,
  canTransition,
  hasPriorRejection,
  resolveOutcome,
  statusAfterRecheck,
  type Ledger,
} from "../src/lib/removal/lifecycle";
import { detectRoutes } from "../src/lib/removal/routes";
import { resealWithLedger, verifyPackageIntegrity, type EvidencePackage } from "../src/lib/removal/evidence.server";
import { trustpilotReviewVisible } from "../src/lib/removal/recheck.server";
import { setPolicyFetcher } from "../src/lib/removal/policy-sources.server";
import { GOOGLE_TIMEOUT_MS } from "../src/lib/google-business-sync.server";

const WORKSPACE = "66666666-6666-4666-8666-666666666666";
let stubAiOutput = "";

/** In-memory stand-in for the query-builder calls ingest and the scan make. */
function memoryDb() {
  const tables: Record<string, any[]> = { reviews: [], alerts: [], removal_cases: [], removal_scans: [], locations: [], google_business_connections: [] };
  let seq = 0;
  const from = (table: string) => {
    tables[table] ??= [];
    const eqs: Array<[string, unknown]> = [];
    const neqs: Array<[string, unknown]> = [];
    const ins: Array<[string, unknown[]]> = [];
    let op: "select" | "update" | "insert" = "select";
    let payload: any = null;
    let inserted: any[] = [];
    const matches = () =>
      tables[table]!.filter(
        (row) => eqs.every(([k, v]) => row[k] === v) && neqs.every(([k, v]) => row[k] !== v) && ins.every(([k, vs]) => vs.includes(row[k])),
      );
    const doInsert = (rows: any) => {
      inserted = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ id: `row-${++seq}`, ...row }));
      tables[table]!.push(...inserted);
    };
    const api: any = {
      select: () => api,
      eq: (k: string, v: unknown) => (eqs.push([k, v]), api),
      neq: (k: string, v: unknown) => (neqs.push([k, v]), api),
      in: (k: string, vs: unknown[]) => (ins.push([k, vs]), api),
      order: () => api,
      limit: () => api,
      update: (p: any) => ((op = "update"), (payload = p), api),
      insert: (p: any) => ((op = "insert"), doInsert(p), api),
      upsert: async (rows: any, options?: { onConflict?: string }) => {
        const keys = (options?.onConflict ?? "id").split(",");
        for (const row of Array.isArray(rows) ? rows : [rows]) {
          if (!tables[table]!.some((r) => keys.every((k) => r[k] === row[k]))) tables[table]!.push({ id: `row-${++seq}`, ...row });
        }
        return { error: null };
      },
      maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      single: async () => ({ data: inserted[0] ?? matches()[0] ?? null, error: null }),
      then: (resolve: any) => {
        if (op === "update") for (const row of matches()) Object.assign(row, payload);
        const data = op === "select" ? matches() : null;
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return api;
  };
  return { tables, client: { from } };
}

beforeAll(() => {
  // No network in the unit suite: the official policy document is "unreachable",
  // so every platform route must stay uncited (NO_SUPPORTED_POLICY_ROUTE).
  setPolicyFetcher((async () => {
    throw new Error("network disabled in unit tests");
  }) as unknown as typeof fetch);
  mock.module("@/lib/ai-gateway.server", () => ({
    runAiText: async () => ({ output: stubAiOutput, model: "fixture/stub-model" }),
  }));
});

// Fixture payloads, shaped like each provider's documented response.
const googleRaw = { id: "gbp:LOC1:REV1", author: "FIXTURE G", rating: 1, body: "FIXTURE: buy followers at spam.test", createdAt: "2026-09-01T10:00:00Z", reply: null };
const trustpilotRaw = {
  id: "5f1a2b3c4d5e6f7a8b9c0d1e",
  stars: 1,
  title: "FIXTURE",
  text: "FIXTURE: honest complaint about a late delivery",
  createdAt: "2026-09-02T10:00:00Z",
  consumer: { displayName: "FIXTURE T" },
  links: [{ href: "https://www.trustpilot.com/reviews/5f1a2b3c4d5e6f7a8b9c0d1e", rel: "public" }],
};
/** A provider this codebase has no integration for yet, mapped straight into the shared shape. */
const futureProvider: NormalizedReview = {
  platform: "yelp",
  source: "yelp",
  externalId: "yelp-FIXTURE-1",
  author: "FIXTURE Y",
  rating: 1,
  title: null,
  body: "FIXTURE: call 555-0100 for the owner's home address",
  createdAt: "2026-09-03T10:00:00Z",
  locationName: "Main St",
  reviewUrl: null,
  reply: null,
};

describe("pipeline: provider payload to verified outcome", () => {
  const db = memoryDb();
  let cases: any[] = [];

  test("every provider normalizes and ingests through one path; re-sync is idempotent", async () => {
    const results = [
      normalizeGoogleReview(googleRaw, { locationName: "Main St", reviewUrl: "https://www.google.com/maps/place/?q=place_id:ChIJFixturePlace01" }),
      normalizeTrustpilotReview(trustpilotRaw, { locationName: "example.com" }),
      validateNormalized(futureProvider),
    ];
    const first = await ingestNormalizedReviews(db.client, { workspaceId: WORKSPACE, results, negativeThreshold: 2, platformLabel: "Mixed" });
    expect(first).toMatchObject({ found: 3, created: 3, updated: 0, alerts: 3 });
    const again = await ingestNormalizedReviews(db.client, { workspaceId: WORKSPACE, results, negativeThreshold: 2, platformLabel: "Mixed" });
    expect(again).toMatchObject({ created: 0, updated: 3, alerts: 0 });
    expect(db.tables.reviews.map((r) => r.platform).sort()).toEqual(["google", "trustpilot", "yelp"]);
  });

  test("the scan flags only reviews the model returned with a known id and a listed violation", async () => {
    const [google, trustpilot, yelp] = ["google", "trustpilot", "yelp"].map((p) => db.tables.reviews.find((r) => r.platform === p)!);
    stubAiOutput = JSON.stringify({
      results: [
        { id: google.id, violation: "spam_or_advertising", confidence: 0.9, rationale: "Advertises an unrelated site.", appeal: "FIXTURE appeal" },
        { id: yelp.id, violation: "personal_information", confidence: 0.8, rationale: "Publishes contact details.", appeal: "FIXTURE appeal" },
        // Injected by review text: an invented category and an id not in the batch.
        { id: trustpilot.id, violation: "defamation_per_se", confidence: 1, rationale: "x" },
        { id: "not-a-review-in-this-batch", violation: "spam_or_advertising", confidence: 1, rationale: "x" },
      ],
    });
    const { runRemovalScan } = await import("../src/lib/removal-scan.server");
    const outcome = await runRemovalScan(db.client, WORKSPACE, 40, null);
    expect(outcome).toEqual({ checked: 3, flagged: 2 });
    cases = db.tables.removal_cases;
    expect(cases.map((c) => c.review_id).sort()).toEqual([google.id, yelp.id].sort());
    for (const row of cases) {
      expect(row.status).toBe("flagged");
      expect(row.outcome).toBe("unverified");
      expect(verifyPackageIntegrity(row.evidence)).toBe(true);
    }
  });

  test("an unknown platform is routed honestly as manual work, with no invented source or statute", () => {
    const yelpCase = cases.find((c) => c.evidence.review.platform === "yelp")!;
    const pkg = yelpCase.evidence as EvidencePackage;
    expect(pkg.review.url).toBeNull();
    expect(pkg.review.urlPrecision).toBe("unavailable");
    for (const route of pkg.routes) {
      expect(route.policyBasis.source).toBe("POLICY_SOURCE_REQUIRED");
      if (route.route.startsWith("platform_") || route.route === "public_reply_mitigation" || route.route === "business_support_escalation") {
        expect(route.actionState).toBe("MANUAL_ACTION_REQUIRED");
      } else {
        expect(route.actionState).toBe("LEGAL_SOURCE_REQUIRED");
      }
    }
    expect(pkg.legal).toEqual({ status: "LEGAL_SOURCE_REQUIRED", jurisdiction: null, authorities: [] });
  });

  test("provider 'accepted' and a user status click never make a review removed", () => {
    const pkg = cases[0]!.evidence as EvidencePackage;
    let ledger: Ledger = pkg.verification.ledger;
    ledger = appendEntry(ledger, { phase: "SUBMISSION", at: "2026-09-10T10:00:00Z", actor: { kind: "user", id: "u" }, observation: "filed", source: { type: "submission_record", detail: "route=platform_policy_report" } });
    ledger = appendEntry(ledger, {
      phase: "RESPONSE",
      at: "2026-09-11T10:00:00Z",
      actor: { kind: "provider", id: null },
      observation: "The provider answered: accepted.",
      source: { type: "provider_response", detail: "channel=email" },
      providerResponse: { channel: "email", verbatim: "FIXTURE: we removed it", reference: null, decision: "accepted", receivedAt: "2026-09-11T10:00:00Z" },
    });
    ledger = appendEntry(ledger, { phase: "AFTER", at: "2026-09-11T10:01:00Z", actor: { kind: "user", id: "u" }, observation: 'set status "approved"', source: { type: "user_assertion", detail: "" } });
    const sealed = resealWithLedger(pkg, ledger);
    expect(sealed.verification.outcome).toBe("unverified");
    expect(sealed.verification.providerDecision).toBe("accepted");
  });

  test("an accepted case whose recheck still finds the review goes back to rejected, opening the appeal", () => {
    const ledger: Ledger = [
      { phase: "RESPONSE", at: "2026-09-11T10:00:00Z", actor: { kind: "provider", id: null }, observation: "accepted", source: { type: "provider_response", detail: "" }, providerResponse: { channel: "email", verbatim: "ok", reference: null, decision: "accepted", receivedAt: "2026-09-11T10:00:00Z" } },
      { phase: "RECHECK", at: "2026-09-14T10:00:00Z", actor: { kind: "system", id: null }, observation: "still returned", source: { type: "provider_api_recheck", detail: "200" }, reviewVisible: true },
    ];
    const resolved = resolveOutcome(ledger);
    expect(resolved.outcome).toBe("retained");
    const next = statusAfterRecheck("approved", resolved.outcome);
    expect(next).toBe("rejected");
    expect(hasPriorRejection(ledger, next)).toBe(true);
    const routes = detectRoutes({ platform: "google", violation: "spam_or_advertising", capability: { providerApiApproved: false, legalSourceConnected: false }, priorRejection: true });
    expect(routes.some((r) => r.route === "platform_appeal")).toBe(true);
    // A status click still cannot reopen a closed case.
    expect(canTransition("approved", "rejected")).toBe(false);
  });

  test("only a recheck that observed the review gone establishes removal", () => {
    expect(statusAfterRecheck("submitted", "removed")).toBe("approved");
    expect(statusAfterRecheck("submitted", "retained")).toBe("rejected");
    expect(statusAfterRecheck("submitted", "unverified")).toBeNull();
    expect(statusAfterRecheck("approved", "removed")).toBeNull();
    expect(statusAfterRecheck("flagged", "removed")).toBeNull();
    const unobserved: Ledger = [{ phase: "RECHECK", at: "2026-09-14T10:00:00Z", actor: { kind: "system", id: null }, observation: "timeout", source: { type: "provider_api_recheck", detail: "" }, reviewVisible: null }];
    expect(resolveOutcome(unobserved).outcome).toBe("unverified");
  });
});

describe("observation timestamps", () => {
  const now = new Date("2026-09-25T12:00:00Z");

  test("a future-dated observation is refused, so it cannot outrank later real rechecks", () => {
    expect(() => assertNotFuture("2099-01-01T00:00:00Z", now)).toThrow(/future/);
    expect(() => assertNotFuture("not a date", now)).toThrow();
    expect(() => assertNotFuture("2026-09-25T12:04:00Z", now)).not.toThrow();
    expect(() => assertNotFuture("2026-09-20T12:00:00Z", now)).not.toThrow();
  });

  test("why it matters: the latest-dated recheck decides the outcome", () => {
    const ledger: Ledger = [
      { phase: "RECHECK", at: "2099-01-01T00:00:00Z", actor: { kind: "user", id: "u" }, observation: "gone", source: { type: "user_reported_observation", detail: "" }, reviewVisible: false },
      { phase: "RECHECK", at: "2026-09-25T12:00:00Z", actor: { kind: "system", id: null }, observation: "still there", source: { type: "provider_api_recheck", detail: "" }, reviewVisible: true },
    ];
    expect(resolveOutcome(ledger).outcome).toBe("removed");
  });
});

describe("provider fetches are bounded and a failed recheck observes nothing", () => {
  test("Google calls carry a timeout", () => {
    expect(GOOGLE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  test("Trustpilot recheck: 200 visible, 404 gone, 5xx and network failure unknown", async () => {
    const status = (code: number) => (async () => new Response("{}", { status: code })) as unknown as typeof fetch;
    expect((await trustpilotReviewVisible("k", "r1", status(200))).visible).toBe(true);
    expect((await trustpilotReviewVisible("k", "r1", status(404))).visible).toBe(false);
    expect((await trustpilotReviewVisible("k", "r1", status(503))).visible).toBeNull();
    const timedOut = (async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;
    const observation = await trustpilotReviewVisible("SECRET_KEY", "r1", timedOut);
    expect(observation.visible).toBeNull();
    expect(observation.detail).not.toContain("SECRET_KEY");
  });
});
