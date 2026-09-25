/**
 * Integration test for the real scan path.
 *
 * This calls the production `runRemovalScan` and checks what it would write. The
 * Supabase client and the AI gateway are both stubbed in memory, so:
 *
 *   - no database connection is opened and no production row is written
 *   - no model is called and no API spend happens
 *   - the stub AI output is the only invented thing, and it is clearly a fixture
 *
 * What is being verified is the real code: route detection, evidence assembly,
 * the honest outcome, and the refusal to act on a violation label the model made
 * up.
 *
 * Run with: bun test tests/
 */

import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { EvidencePackage } from "../src/lib/removal/evidence.server";
import type { DetectedRoute } from "../src/lib/removal/routes";
import { setPolicyFetcher } from "../src/lib/removal/policy-sources.server";

const FIXTURE_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const FIXTURE_USER = "33333333-3333-4333-8333-333333333333";

const FIXTURE_REVIEWS = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    author: "Fixture Spammer",
    rating: 1,
    body: "FIXTURE: visit cheap-deals.test for discount vouchers, unrelated to this shop",
    platform: "google",
    location_name: "Fixture Location",
    external_created_at: "2026-09-01T09:00:00.000Z",
    external_id: "gbp:LOC_FIXTURE:REV_ONE",
    review_url: "https://www.google.com/maps/place/?q=place_id:ChIJFixturePlace",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    author: "Fixture Honest Customer",
    rating: 2,
    body: "FIXTURE: the delivery was three days late and nobody answered the phone",
    platform: "google",
    location_name: "Fixture Location",
    external_created_at: "2026-09-02T09:00:00.000Z",
    external_id: "gbp:LOC_FIXTURE:REV_TWO",
    review_url: null,
  },
];

/** What the stub model returns. Set per test before calling the scan. */
let stubAiOutput = "";
const STUB_MODEL = "fixture/stub-model";

type Row = Record<string, unknown>;
type Write = { table: string; op: "insert" | "update" | "upsert"; rows: Row | Row[] };

/** Everything the stub client was asked to write, for inspection. */
const writes: Write[] = [];

/** The subset of the Supabase query builder that `runRemovalScan` actually uses. */
type StubChain = {
  select: () => StubChain;
  eq: () => StubChain;
  neq: () => StubChain;
  order: () => StubChain;
  limit: () => StubChain;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  upsert: (rows: Row | Row[]) => Promise<{ error: null }>;
  insert: (rows: Row | Row[]) => Promise<{ error: null }>;
  update: (rows: Row) => StubChain;
  then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise<unknown>;
};

function stubClient() {
  const from = (table: string): StubChain => {
    const chain: StubChain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => {
        if (table === "google_business_connections") {
          // Connected, but business.manage was never granted — the live state.
          return Promise.resolve({
            data: {
              status: "connected",
              scopes: ["openid", "https://www.googleapis.com/auth/userinfo.email"],
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      upsert: (rows) => {
        writes.push({ table, op: "upsert", rows });
        return Promise.resolve({ error: null });
      },
      insert: (rows) => {
        writes.push({ table, op: "insert", rows });
        return Promise.resolve({ error: null });
      },
      update: (rows) => {
        writes.push({ table, op: "update", rows });
        return chain;
      },
      // `reviews` and `removal_cases` are awaited directly on the query chain.
      then: (resolve) => {
        const data = table === "reviews" ? (FIXTURE_REVIEWS as unknown as Row[]) : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { from };
}

beforeAll(() => {
  // No network in the unit suite: the official policy document is "unreachable",
  // so every platform route must stay uncited (NO_SUPPORTED_POLICY_ROUTE).
  setPolicyFetcher((async () => {
    throw new Error("network disabled in unit tests");
  }) as unknown as typeof fetch);
  mock.module("@/lib/ai-gateway.server", () => ({
    runAiText: async () => ({ output: stubAiOutput, model: STUB_MODEL }),
  }));
});

type CaseRow = {
  review_id: string;
  violation_type: string;
  route: string | null;
  outcome: string;
  outcome_at: string | null;
  evidence: EvidencePackage;
};

function caseRows(): CaseRow[] {
  const write = writes.find((w) => w.table === "removal_cases");
  if (!write) return [];
  return (Array.isArray(write.rows) ? write.rows : [write.rows]) as unknown as CaseRow[];
}

function firstCase(): CaseRow {
  const rows = caseRows();
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!;
}

async function runScan() {
  writes.length = 0;
  const { runRemovalScan } = await import("../src/lib/removal-scan.server");
  return runRemovalScan(stubClient(), FIXTURE_WORKSPACE, 40, FIXTURE_USER);
}

describe("runRemovalScan writes a complete, honest case", () => {
  test("flags only the review that breaks policy and leaves honest criticism alone", async () => {
    stubAiOutput = JSON.stringify({
      results: [
        {
          id: FIXTURE_REVIEWS[0]!.id,
          violation: "spam_or_advertising",
          confidence: 0.93,
          rationale:
            "The review advertises an unrelated site instead of describing the customer experience.",
          appeal: "FIXTURE appeal text.",
        },
      ],
    });
    const result = await runScan();
    expect(result).toEqual({ checked: 2, flagged: 1 });
    expect(caseRows().length).toBe(1);
    expect(firstCase().review_id).toBe(FIXTURE_REVIEWS[0]!.id);
    expect(firstCase().violation_type).toBe("spam_or_advertising");
  });

  test("records the primary route, not a guessed one", () => {
    expect(firstCase().route).toBe("platform_policy_report");
  });

  test("stores an outcome of unverified, because nothing has been verified", () => {
    expect(firstCase().outcome).toBe("unverified");
    expect(firstCase().outcome_at).toBeNull();
  });

  test("stores a sealed evidence package with the review text hashed", async () => {
    const { sha256, verifyPackageIntegrity, validateEvidencePackage } =
      await import("../src/lib/removal/evidence.server");
    const pkg = firstCase().evidence;
    expect(pkg.schema).toBe("seovale.evidence.v1");
    expect(pkg.review.bodySha256).toBe(sha256(FIXTURE_REVIEWS[0]!.body));
    expect(verifyPackageIntegrity(pkg)).toBe(true);
    expect(() => validateEvidencePackage(pkg)).not.toThrow();
  });

  test("carries the review URL the sync captured", () => {
    expect(firstCase().evidence.review.url).toBe(FIXTURE_REVIEWS[0]!.review_url);
  });

  test("records the stored place link at listing precision, not as a review permalink", () => {
    expect(firstCase().evidence.review.urlPrecision).toBe("location_reviews");
    expect(firstCase().evidence.review.urlDerivation).toBe("derived_from_place_id");
  });

  test("records the BEFORE phase and nothing beyond it", () => {
    expect(firstCase().evidence.verification.phases).toEqual({
      BEFORE: true,
      SUBMISSION: false,
      RESPONSE: false,
      RECHECK: false,
      AFTER: false,
    });
  });

  test("reports the reply route as needing provider approval, read from the real granted scopes", () => {
    const routes: DetectedRoute[] = firstCase().evidence.routes;
    expect(routes.find((r) => r.route === "public_reply_mitigation")!.actionState).toBe(
      "PROVIDER_APPROVAL_REQUIRED",
    );
    expect(routes.find((r) => r.route === "platform_policy_report")!.actionState).toBe(
      "MANUAL_ACTION_REQUIRED",
    );
  });

  test("cites no policy URL it did not retrieve", () => {
    const items = firstCase().evidence.items.filter((i) => i.id.startsWith("policy_basis_"));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.value).toBe("POLICY_SOURCE_REQUIRED");
  });

  test("names the classifier model on the AI-derived item only", () => {
    const items = firstCase().evidence.items;
    const aiItems = items.filter((i) => i.source.type === "ai_classification");
    expect(aiItems.length).toBe(1);
    expect(aiItems[0]!.source.detail).toContain(STUB_MODEL);
    expect(items.find((i) => i.id === "review_content")!.source.type).toBe("stored_review_row");
  });

  test("records a scan history row with the real counts", () => {
    const scan = writes.find((w) => w.table === "removal_scans");
    const row = (scan?.rows ?? {}) as Row;
    expect(row["reviews_checked"]).toBe(2);
    expect(row["reviews_flagged"]).toBe(1);
    expect(row["status"]).toBe("completed");
  });
});

describe("runRemovalScan refuses invented model output", () => {
  test("drops a violation label that is not on the fixed list", async () => {
    stubAiOutput = JSON.stringify({
      results: [
        {
          id: FIXTURE_REVIEWS[0]!.id,
          violation: "competitor_sabotage_invented_by_the_model",
          confidence: 0.99,
          rationale: "FIXTURE invented category.",
        },
      ],
    });
    const result = await runScan();
    expect(result.flagged).toBe(0);
    expect(caseRows().length).toBe(0);
  });

  test("drops a review id the model made up", async () => {
    stubAiOutput = JSON.stringify({
      results: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          violation: "spam_or_advertising",
          confidence: 0.99,
          rationale: "FIXTURE invented review id.",
        },
      ],
    });
    const result = await runScan();
    expect(result.flagged).toBe(0);
  });

  test("treats unparseable model output as nothing flagged, not as an error state", async () => {
    stubAiOutput = "I am not JSON at all.";
    const result = await runScan();
    expect(result).toEqual({ checked: 2, flagged: 0 });
  });
});

describe("runRemovalScan and the official policy document", () => {
  test("an unreachable policy document is recorded as NO_SUPPORTED_POLICY_ROUTE, never cited", async () => {
    stubAiOutput = JSON.stringify({
      results: [{ id: FIXTURE_REVIEWS[0]!.id, violation: "spam_or_advertising", confidence: 0.9, rationale: "FIXTURE." }],
    });
    await runScan();
    const report = firstCase().evidence.routes.find((r) => r.route === "platform_policy_report")!;
    expect(report.policyBasis.citationStatus).toBe("NO_SUPPORTED_POLICY_ROUTE");
    expect(report.policyBasis.citationReason).toContain("could not be retrieved");
    const item = firstCase().evidence.items.find((i) => i.id === "policy_basis_platform_policy_report")!;
    expect(item.value).toBe("POLICY_SOURCE_REQUIRED");
    expect(item.confidence).toBe(0);
    expect(item.source.detail).toContain("NO_SUPPORTED_POLICY_ROUTE");
  });

  test("a retrieved document with the section heading is cited, with URL, title, excerpt, time and hash", async () => {
    const { setPolicyFetcher } = await import("../src/lib/removal/policy-sources.server");
    // FIXTURE HTML, shaped like the Help Center markup: a section toggle heading and its text.
    const html =
      "<html><head><title>FIXTURE Prohibited &amp; restricted content</title></head><body>" +
      '<a class="zippy" name="advertising_and_solicitation">Advertising &amp; solicitation</a>' +
      "<div><p>FIXTURE: don&rsquo;t post content for advertising or solicitation purposes.</p></div>" +
      '<a class="zippy" name="next">Unclear and Repetitive Content</a><div><p>FIXTURE other section.</p></div>' +
      "</body></html>";
    setPolicyFetcher((async () => {
      const response = new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      Object.defineProperty(response, "url", { value: "https://fixture.test/final-policy" });
      return response;
    }) as unknown as typeof fetch);
    try {
      stubAiOutput = JSON.stringify({
        results: [{ id: FIXTURE_REVIEWS[0]!.id, violation: "spam_or_advertising", confidence: 0.9, rationale: "FIXTURE." }],
      });
      await runScan();
      const pkg = firstCase().evidence;
      const report = pkg.routes.find((r) => r.route === "platform_policy_report")!;
      expect(report.policyBasis.citationStatus).toBe("CITED");
      expect(report.policyBasis.citation!.section).toBe("Advertising & solicitation");
      expect(report.policyBasis.citation!.excerpt).toBe("FIXTURE: don’t post content for advertising or solicitation purposes.");
      expect(report.policyBasis.citation!.finalUrl).toBe("https://fixture.test/final-policy");
      expect(report.policyBasis.citation!.documentSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(report.humanAction!.destination!.url).toBe("https://support.google.com/business/workflow/9945796");
      const item = pkg.items.find((i) => i.id === "policy_basis_platform_policy_report")!;
      expect(item.source.type).toBe("retrieved_policy_document");
      expect(item.source.url).toBe("https://fixture.test/final-policy");
      expect(item.confidence).toBe(1);
      // Legal routes never inherit a platform policy citation.
      for (const route of pkg.routes.filter((r) => r.actionState === "LEGAL_SOURCE_REQUIRED")) {
        expect(route.policyBasis.source).toBe("POLICY_SOURCE_REQUIRED");
      }
      const { verifyPackageIntegrity, validateEvidencePackage } = await import("../src/lib/removal/evidence.server");
      expect(verifyPackageIntegrity(pkg)).toBe(true);
      expect(() => validateEvidencePackage(pkg)).not.toThrow();
    } finally {
      setPolicyFetcher((async () => {
        throw new Error("network disabled in unit tests");
      }) as unknown as typeof fetch);
    }
  });
});
