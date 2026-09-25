/**
 * Policy citations, human-action destinations, the legal approval gate,
 * ledger idempotency, the derived case stage and the scheduled recheck.
 *
 * Everything runs on in-memory fixtures. The HTML below is a FIXTURE shaped like
 * the two official documents' markup; it is not the platforms' policy text.
 * No network, database or model is touched. (The live read-only check of the
 * real Google page is a separate scratch script run by hand, not this suite.)
 *
 * Run with: bun test tests/
 */

import { afterAll, describe, expect, test } from "bun:test";
import {
  citeFromDocument,
  decodeEntities,
  extractSection,
  extractTitle,
  lookupPolicyCitation,
  MAX_BYTES,
  MAX_EXCERPT,
  POLICY_SOURCES,
  retrieveDocument,
  setPolicyFetcher,
  type RetrievedDocument,
} from "../src/lib/removal/policy-sources.server";
import { assertHumanApproval, detectRoutes, lookupFromRoutes } from "../src/lib/removal/routes";
import { VIOLATIONS } from "../src/lib/removal-scan.server";
import { deriveCaseStage, findRecentDuplicate, type Ledger, type LedgerEntry } from "../src/lib/removal/lifecycle";
import { buildEvidencePackage, validateEvidencePackage, verifyPackageIntegrity } from "../src/lib/removal/evidence.server";
import { runDueRechecks } from "../src/lib/removal/scheduled.server";

const NO_NETWORK = (async () => {
  throw new Error("network disabled in unit tests");
}) as unknown as typeof fetch;
setPolicyFetcher(NO_NETWORK);
afterAll(() => setPolicyFetcher(NO_NETWORK));

const GOOGLE_FIXTURE = `<html><head><title>FIXTURE Prohibited &amp; restricted content - Help</title>
<script>var x = "<h2>Harassment</h2>";</script></head><body>
<h1>FIXTURE Prohibited &amp; restricted content</h1>
<p class="zippy">&nbsp;<a id="fake" name="fake"></a>Fake Engagement&nbsp;</p>
<div><p>FIXTURE fake engagement text. <a href="/x" class="glossary-term">Fake engagement</a> is not allowed.</p></div>
<h2 class="zippy"><a id="rating"></a>Rating Manipulation</h2>
<div><div>FIXTURE rating text.</div><ul><li>Content posted due to an incentive.</li><li>Content that is based on a conflict of interest. FIXTURE employees and competitors.</li></ul></div>
<h2>Inappropriate content &amp; behavior</h2>
<a class="zippy" name="harassment">Harassment</a>
<div><p>FIXTURE: we don&rsquo;t allow content to harass people. Mentions of hate speech inside running text are not headings.</p></div>
<a class="zippy" name="obscenity_and_profanity">Obscenity &amp; profanity</a>
<div><p>${"FIXTURE long profanity text. ".repeat(30)}</p></div>
<a class="zippy" name="off-topic">Off-topic</a>
<div><p>FIXTURE off-topic text.</p></div>
</body></html>`;

const TRUSTPILOT_FIXTURE = `<html><head><title>FIXTURE Guidelines for reviewers</title></head><body>
<h3>Who can and can’t write a review?</h3><p>FIXTURE eligibility. You’re not eligible where you have a special relationship to the business you’re reviewing.</p>
<h3>What about fake reviews?</h3><p>FIXTURE fake reviews text.</p>
<p class="t"><b>Harmful or illegal </b></p><p>FIXTURE intro.</p><p>Hate speech or discrimination: FIXTURE hate text.</p><p>Obscenity: FIXTURE obscenity text.</p>
<p class="t"><b>Personal information </b></p><p>FIXTURE personal information text.</p>
<p>A paragraph with <b>bold words</b> in running text is not a heading.</p>
</body></html>`;

function doc(body: string, overrides: Partial<RetrievedDocument> = {}): RetrievedDocument {
  return {
    requestedUrl: "https://fixture.test/requested",
    finalUrl: "https://fixture.test/final",
    title: extractTitle(body),
    body,
    retrievedAt: "2026-09-25T10:00:00.000Z",
    sha256: "a".repeat(64),
    truncated: false,
    ...overrides,
  };
}

describe("citation extraction", () => {
  test("decodes the entities the Help Center uses", () => {
    expect(decodeEntities("Obscenity &amp; profanity &#39;x&#x27; don&rsquo;t&nbsp;")).toBe("Obscenity & profanity 'x' don’t ");
  });

  test("reads the <title> entity-decoded", () => {
    expect(extractTitle(GOOGLE_FIXTURE)).toBe("FIXTURE Prohibited & restricted content - Help");
  });

  test("cites a section only when its heading element is present, with the text that follows it", () => {
    const found = extractSection(GOOGLE_FIXTURE, { heading: "Harassment" });
    expect(found?.section).toBe("Harassment");
    expect(found?.excerpt).toBe(
      "FIXTURE: we don’t allow content to harass people. Mentions of hate speech inside running text are not headings.",
    );
  });

  test("a phrase in running text or inside a script is never treated as a heading", () => {
    expect(extractSection(GOOGLE_FIXTURE, { heading: "Hate speech" })).toBeNull();
    expect(extractSection(TRUSTPILOT_FIXTURE, { heading: "bold words" })).toBeNull();
  });

  test("the excerpt stops at the next heading and is capped", () => {
    const off = extractSection(GOOGLE_FIXTURE, { heading: "Obscenity & profanity" })!;
    expect(off.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT);
    expect(off.excerpt).not.toContain("off-topic");
  });

  test("matches heading case and spacing loosely (Fake engagement / Fake Engagement&nbsp;)", () => {
    expect(extractSection(GOOGLE_FIXTURE, { heading: "Fake engagement" })?.section).toBe("Fake Engagement");
  });

  test("an anchor starts the excerpt at the passage that applies, inside the cited section", () => {
    const coi = extractSection(GOOGLE_FIXTURE, { heading: "Rating Manipulation", anchor: "Content that is based on a conflict of interest" })!;
    expect(coi.excerpt.startsWith("Content that is based on a conflict of interest.")).toBe(true);
  });

  test("Trustpilot's bold-paragraph sub-headings and curly apostrophes are recognised", () => {
    expect(extractSection(TRUSTPILOT_FIXTURE, { heading: "Personal information" })?.excerpt.startsWith("FIXTURE personal information text.")).toBe(true);
    const hate = extractSection(TRUSTPILOT_FIXTURE, { heading: "Harmful or illegal", anchor: "Hate speech or discrimination" })!;
    expect(hate.excerpt.startsWith("Hate speech or discrimination: FIXTURE hate text.")).toBe(true);
    expect(extractSection(TRUSTPILOT_FIXTURE, { heading: "Who can and can't write a review?" })).not.toBeNull();
  });
});

describe("violation mapping", () => {
  test("every fixed violation is mapped for both registered platforms", () => {
    for (const platform of ["google", "trustpilot"]) {
      for (const violation of VIOLATIONS) expect(POLICY_SOURCES[platform]!.sections[violation]?.length).toBeGreaterThan(0);
    }
  });

  test("a mapped heading present in the document produces a full citation", () => {
    const result = citeFromDocument(doc(GOOGLE_FIXTURE), "google", "hate_or_harassment");
    expect(result.status).toBe("CITED");
    if (result.status !== "CITED") return;
    expect(result.citation).toMatchObject({
      platform: "google",
      violation: "hate_or_harassment",
      documentUrl: POLICY_SOURCES["google"]!.url,
      finalUrl: "https://fixture.test/final",
      title: "FIXTURE Prohibited & restricted content - Help",
      section: "Harassment",
      retrievedAt: "2026-09-25T10:00:00.000Z",
      documentSha256: "a".repeat(64),
    });
  });

  test("a mapped heading missing from the document is NO_SUPPORTED_POLICY_ROUTE", () => {
    const result = citeFromDocument(doc(GOOGLE_FIXTURE), "google", "personal_information");
    expect(result.status).toBe("NO_SUPPORTED_POLICY_ROUTE");
  });

  test("an unknown platform or unknown violation is NO_SUPPORTED_POLICY_ROUTE", async () => {
    expect(citeFromDocument(doc(GOOGLE_FIXTURE), "yelp", "off_topic").status).toBe("NO_SUPPORTED_POLICY_ROUTE");
    expect(citeFromDocument(doc(GOOGLE_FIXTURE), "google", "invented").status).toBe("NO_SUPPORTED_POLICY_ROUTE");
    expect((await lookupPolicyCitation("yelp", "off_topic")).status).toBe("NO_SUPPORTED_POLICY_ROUTE");
  });

  test("a failed fetch is NO_SUPPORTED_POLICY_ROUTE with the reason, never a citation", async () => {
    setPolicyFetcher(NO_NETWORK);
    const result = await lookupPolicyCitation("google", "off_topic");
    expect(result.status).toBe("NO_SUPPORTED_POLICY_ROUTE");
    if (result.status === "NO_SUPPORTED_POLICY_ROUTE") expect(result.reason).toContain("could not be retrieved");
  });

  test("a non-200 answer is a failure, not a document", async () => {
    setPolicyFetcher((async () => new Response("gone", { status: 404 })) as unknown as typeof fetch);
    expect((await lookupPolicyCitation("google", "off_topic")).status).toBe("NO_SUPPORTED_POLICY_ROUTE");
    setPolicyFetcher(NO_NETWORK);
  });
});

describe("retrieval", () => {
  test("hashes the fetched body, follows the final URL and caches for the day", async () => {
    let calls = 0;
    setPolicyFetcher((async () => {
      calls += 1;
      const response = new Response(GOOGLE_FIXTURE, { status: 200 });
      Object.defineProperty(response, "url", { value: "https://fixture.test/after-redirect" });
      return response;
    }) as unknown as typeof fetch);
    const first = await retrieveDocument("https://fixture.test/policy");
    const second = await retrieveDocument("https://fixture.test/policy");
    expect(calls).toBe(1);
    expect(second).toBe(first);
    expect(first.finalUrl).toBe("https://fixture.test/after-redirect");
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.truncated).toBe(false);
    const tomorrow = new Date(Date.parse(first.retrievedAt) + 25 * 3_600_000);
    await retrieveDocument("https://fixture.test/policy", tomorrow);
    expect(calls).toBe(2);
    setPolicyFetcher(NO_NETWORK);
  });

  test("reads at most MAX_BYTES and says so", async () => {
    const big = "x".repeat(MAX_BYTES + 1000);
    setPolicyFetcher((async () => new Response(big, { status: 200 })) as unknown as typeof fetch);
    const got = await retrieveDocument("https://fixture.test/big");
    expect(got.body.length).toBe(MAX_BYTES);
    expect(got.truncated).toBe(true);
    setPolicyFetcher(NO_NETWORK);
  });
});

describe("routes and the evidence package", () => {
  const cited = citeFromDocument(doc(GOOGLE_FIXTURE, { sha256: "b".repeat(64) }), "google", "hate_or_harassment");
  const capability = { providerApiApproved: false, legalSourceConnected: false };

  test("a real citation replaces POLICY_SOURCE_REQUIRED on the platform routes only", () => {
    const routes = detectRoutes({ platform: "google", violation: "hate_or_harassment", capability, policyLookup: cited });
    const report = routes.find((r) => r.route === "platform_policy_report")!;
    expect(report.policyBasis.citationStatus).toBe("CITED");
    expect(report.policyBasis.source).toEqual({ url: "https://fixture.test/final", retrievedAt: "2026-09-25T10:00:00.000Z", jurisdiction: null });
    for (const legal of routes.filter((r) => r.actionState === "LEGAL_SOURCE_REQUIRED")) {
      expect(legal.policyBasis.source).toBe("POLICY_SOURCE_REQUIRED");
      expect(legal.policyBasis.citation).toBeUndefined();
    }
  });

  test("the Google policy report carries the verified official destination; others carry none", () => {
    const google = detectRoutes({ platform: "google", violation: "off_topic", capability });
    const report = google.find((r) => r.route === "platform_policy_report")!;
    expect(report.humanAction?.destination?.url).toBe("https://support.google.com/business/workflow/9945796");
    expect(report.humanAction?.evidenceRequired).toContain("review_content");
    expect(google.find((r) => r.route === "business_support_escalation")!.humanAction?.destination).toBeNull();
    const tp = detectRoutes({ platform: "trustpilot", violation: "off_topic", capability });
    expect(tp.find((r) => r.route === "platform_policy_report")!.humanAction?.destination).toBeNull();
  });

  test("the reason calls the violation a candidate, not a finding", () => {
    const report = detectRoutes({ platform: "google", violation: "off_topic", capability })[0]!;
    expect(report.reason).toContain("candidate");
    expect(report.reason).not.toContain("which the platform content policy prohibits");
  });

  test("re-detection keeps the citation that was sealed", () => {
    const routes = detectRoutes({ platform: "google", violation: "hate_or_harassment", capability, policyLookup: cited });
    const again = detectRoutes({ platform: "google", violation: "hate_or_harassment", capability, priorRejection: true, policyLookup: lookupFromRoutes(routes) });
    expect(again.find((r) => r.route === "platform_appeal")!.policyBasis.citation?.section).toBe("Harassment");
  });

  function pkgWith(routes: ReturnType<typeof detectRoutes>) {
    return buildEvidencePackage({
      review: {
        id: "77777777-7777-4777-8777-777777777777",
        platform: "google",
        externalId: "gbp:FIXTURE",
        author: "FIXTURE",
        rating: 1,
        body: "FIXTURE review text",
        externalCreatedAt: null,
        url: null,
        urlPrecision: "unavailable",
        urlDerivation: "unavailable",
        urlPatternSource: null,
      },
      finding: { violationType: "hate_or_harassment", confidence: 0.8, explanation: "FIXTURE", model: "fixture/model" },
      routes,
      ledger: [],
      legalSourceConnected: false,
      now: new Date("2026-09-25T12:00:00.000Z"),
    });
  }

  test("a cited package seals, verifies and shows the verbatim excerpt", () => {
    const pkg = pkgWith(detectRoutes({ platform: "google", violation: "hate_or_harassment", capability, policyLookup: cited }));
    expect(verifyPackageIntegrity(pkg)).toBe(true);
    const item = pkg.items.find((i) => i.id === "policy_basis_platform_policy_report")!;
    expect(item.source.type).toBe("retrieved_policy_document");
    expect(item.value).toContain("FIXTURE: we don’t allow content to harass people.");
    expect(item.source.detail).toContain("b".repeat(64));
    expect(pkg.items.find((i) => i.id === "policy_classification")!.claim).toContain("candidate");
  });

  test("a package claiming a citation with no retrieved document behind it is refused", () => {
    const routes = detectRoutes({ platform: "google", violation: "hate_or_harassment", capability, policyLookup: cited });
    const pkg = pkgWith(routes);
    const forged = structuredClone(pkg);
    forged.routes[0]!.policyBasis.citation!.documentSha256 = "not-a-hash";
    expect(() => validateEvidencePackage(forged)).toThrow(/not backed by a retrieved document/);
    const noUrl = structuredClone(pkg);
    noUrl.routes[0]!.policyBasis.source = { url: "", retrievedAt: "2026-09-25T10:00:00.000Z", jurisdiction: null };
    expect(() => validateEvidencePackage(noUrl)).toThrow();
  });
});

describe("human approval gate for legal routes", () => {
  test("a member can never record a legal submission", () => {
    expect(() => assertHumanApproval({ route: "legal_removal_request", role: "member", humanApproved: true })).toThrow(/owner or admin/);
  });
  test("an owner or admin must explicitly confirm approval", () => {
    expect(() => assertHumanApproval({ route: "regulator_complaint", role: "owner" })).toThrow(/approved by a person/);
    expect(() => assertHumanApproval({ route: "court_order_evidence", role: "admin", humanApproved: false })).toThrow();
    expect(() => assertHumanApproval({ route: "court_order_evidence", role: "admin", humanApproved: true })).not.toThrow();
  });
  test("platform routes are not gated", () => {
    expect(() => assertHumanApproval({ route: "platform_policy_report", role: "member" })).not.toThrow();
  });
});

const submission = (at: string, detail: string): LedgerEntry => ({
  phase: "SUBMISSION",
  at,
  actor: { kind: "user", id: "u" },
  observation: "filed",
  source: { type: "submission_record", detail },
});
const response = (at: string, decision: "accepted" | "rejected" | "no_response", verbatim = "FIXTURE answer"): LedgerEntry => ({
  phase: "RESPONSE",
  at,
  actor: { kind: "provider", id: null },
  observation: `The provider answered: ${decision}.`,
  source: { type: "provider_response", detail: "channel=email" },
  providerResponse: { channel: "email", verbatim, reference: null, decision, receivedAt: at },
});

describe("ledger idempotency", () => {
  const ledger: Ledger = [submission("2026-09-25T10:00:00.000Z", "route=platform_policy_report; channel=manual_provider_interface; provider reference=ABC")];

  test("the same route and reference within ten minutes is the existing entry", () => {
    const retry = submission("2026-09-25T10:05:00.000Z", "route=platform_policy_report; channel=manual_provider_interface; provider reference=ABC");
    expect(findRecentDuplicate(ledger, retry)).toBe(ledger[0]!);
  });
  test("a different route, a different reference or a later filing is new", () => {
    expect(findRecentDuplicate(ledger, submission("2026-09-25T10:05:00.000Z", "route=platform_appeal; channel=manual_provider_interface; provider reference=ABC"))).toBeNull();
    expect(findRecentDuplicate(ledger, submission("2026-09-25T10:05:00.000Z", "route=platform_policy_report; channel=manual_provider_interface; provider reference=XYZ"))).toBeNull();
    expect(findRecentDuplicate(ledger, submission("2026-09-25T10:11:00.000Z", "route=platform_policy_report; channel=manual_provider_interface; provider reference=ABC"))).toBeNull();
  });
  test("the same provider answer twice is one answer; a different answer is not", () => {
    const answered: Ledger = [response("2026-09-25T10:00:00.000Z", "rejected")];
    expect(findRecentDuplicate(answered, response("2026-09-25T10:02:00.000Z", "rejected"))).not.toBeNull();
    expect(findRecentDuplicate(answered, response("2026-09-25T10:02:00.000Z", "accepted"))).toBeNull();
    expect(findRecentDuplicate(answered, response("2026-09-25T10:02:00.000Z", "rejected", "FIXTURE other text"))).toBeNull();
  });
});

describe("derived case stage", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  const before: LedgerEntry = { phase: "BEFORE", at: "2026-09-25T09:00:00.000Z", actor: { kind: "system", id: null }, observation: "opened", source: { type: "stored_review_row", detail: "" } };
  const recheck = (at: string, visible: boolean | null): LedgerEntry => ({ phase: "RECHECK", at, actor: { kind: "system", id: null }, observation: "x", source: { type: "provider_api_recheck", detail: "" }, reviewVisible: visible });

  test("flagged cases: IDENTIFIED, HUMAN_REVIEW, READY_TO_SUBMIT", () => {
    expect(deriveCaseStage({ status: "flagged", outcome: "unverified", ledger: [], now })).toBe("IDENTIFIED");
    expect(deriveCaseStage({ status: "flagged", outcome: "unverified", ledger: [before], now })).toBe("HUMAN_REVIEW");
    expect(deriveCaseStage({ status: "flagged", outcome: "unverified", ledger: [before], policyCited: true, now })).toBe("READY_TO_SUBMIT");
  });
  test("submission and platform review", () => {
    expect(deriveCaseStage({ status: "submitted", outcome: "unverified", ledger: [before, submission("2026-09-25T10:00:00.000Z", "route=platform_policy_report; channel=x")], now })).toBe("SUBMITTED");
    expect(deriveCaseStage({ status: "submitted", outcome: "unverified", ledger: [before, submission("2026-09-25T10:00:00.000Z", "route=platform_policy_report; channel=x; provider reference=R1")], now })).toBe("PLATFORM_REVIEW");
  });
  test("provider answers are ACCEPTED / APPEAL_AVAILABLE / REJECTED, never REMOVED", () => {
    const sub = submission("2026-09-25T10:00:00.000Z", "route=platform_policy_report; channel=x");
    expect(deriveCaseStage({ status: "approved", outcome: "unverified", ledger: [sub, response("2026-09-25T11:00:00.000Z", "accepted")], now })).toBe("ACCEPTED");
    expect(deriveCaseStage({ status: "rejected", outcome: "unverified", ledger: [sub, response("2026-09-25T11:00:00.000Z", "rejected")], now })).toBe("APPEAL_AVAILABLE");
    const appealed = [submission("2026-09-25T08:00:00.000Z", "route=platform_appeal; channel=x"), sub, response("2026-09-25T11:00:00.000Z", "rejected")];
    expect(deriveCaseStage({ status: "rejected", outcome: "unverified", ledger: appealed, now })).toBe("REJECTED");
  });
  test("REMOVED only on a recheck that saw the review gone; retained is NOT_REMOVED or APPEAL_AVAILABLE", () => {
    const sub = submission("2026-09-25T10:00:00.000Z", "route=platform_policy_report; channel=x");
    expect(deriveCaseStage({ status: "approved", outcome: "removed", ledger: [sub, recheck("2026-09-25T11:00:00.000Z", false)], now })).toBe("REMOVED");
    // A stored "removed" that the ledger does not support is not shown as removed.
    expect(deriveCaseStage({ status: "approved", outcome: "removed", ledger: [sub, response("2026-09-25T11:00:00.000Z", "accepted")], now })).toBe("ACCEPTED");
    expect(deriveCaseStage({ status: "rejected", outcome: "retained", ledger: [sub, recheck("2026-09-25T11:00:00.000Z", true)], now })).toBe("APPEAL_AVAILABLE");
    expect(deriveCaseStage({ status: "approved", outcome: "retained", ledger: [sub, recheck("2026-09-25T11:00:00.000Z", true)], now })).toBe("NOT_REMOVED");
  });
  test("an overdue recheck is RECHECK_REQUIRED; dismissed is CLOSED", () => {
    const old = submission("2026-09-01T10:00:00.000Z", "route=platform_policy_report; channel=x");
    expect(deriveCaseStage({ status: "submitted", outcome: "unverified", ledger: [old], now })).toBe("RECHECK_REQUIRED");
    expect(deriveCaseStage({ status: "dismissed", outcome: "unverified", ledger: [old], now })).toBe("CLOSED");
  });
});

describe("scheduled rechecks", () => {
  const WS = "88888888-8888-4888-8888-888888888888";
  const OTHER_WS = "99999999-9999-4999-8999-999999999999";
  const oldSubmission = submission("2026-09-01T10:00:00.000Z", "route=platform_policy_report; channel=x");

  function memoryAdmin() {
    const tables: Record<string, any[]> = {
      removal_cases: [
        { id: "case-due-google", workspace_id: WS, status: "submitted", review_id: "rev-g", route: "platform_policy_report", outcome: "unverified", updated_at: "2026-09-01", evidence: { schema: "seovale.evidence.legacy_ledger_only", verification: { ledger: [oldSubmission] } } },
        { id: "case-due-noconn", workspace_id: OTHER_WS, status: "submitted", review_id: "rev-y", route: "platform_policy_report", outcome: "unverified", updated_at: "2026-09-02", evidence: { schema: "seovale.evidence.legacy_ledger_only", verification: { ledger: [oldSubmission] } } },
        { id: "case-not-due", workspace_id: WS, status: "submitted", review_id: "rev-g2", route: null, outcome: "unverified", updated_at: "2026-09-03", evidence: { schema: "seovale.evidence.legacy_ledger_only", verification: { ledger: [submission("2026-09-25T09:00:00.000Z", "route=platform_policy_report; channel=x")] } } },
      ],
      reviews: [
        { id: "rev-g", workspace_id: WS, platform: "google", external_id: "gbp:L:R" },
        { id: "rev-y", workspace_id: OTHER_WS, platform: "yelp", external_id: "y1" },
        { id: "rev-g2", workspace_id: WS, platform: "google", external_id: "gbp:L:R2" },
      ],
    };
    const from = (table: string) => {
      const eqs: Array<[string, unknown]> = [];
      const ins: Array<[string, unknown[]]> = [];
      let patch: any = null;
      let selectExpr = "";
      const rows = () => tables[table]!.filter((r) => eqs.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k])));
      const project = (r: any) => (selectExpr.includes("ledger:evidence->verification->ledger") ? { ...r, ledger: r.evidence?.verification?.ledger ?? null } : r);
      const api: any = {
        select: (expr = "") => ((selectExpr = expr), api),
        eq: (k: string, v: unknown) => (eqs.push([k, v]), api),
        in: (k: string, vs: unknown[]) => (ins.push([k, vs]), api),
        order: () => api,
        limit: () => api,
        update: (p: any) => ((patch = p), api),
        maybeSingle: async () => ({ data: rows()[0] ? project(rows()[0]) : null, error: null }),
        then: (resolve: any) => {
          if (patch) {
            // An update must be scoped to both the case and its workspace.
            expect(eqs.some(([k]) => k === "workspace_id")).toBe(true);
            for (const r of rows()) Object.assign(r, patch);
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: rows().map(project), error: null }).then(resolve);
        },
      };
      return api;
    };
    return { tables, client: { from } };
  }

  test("rechecks only due cases with a working connection and never records a guess", async () => {
    const db = memoryAdmin();
    const observed: string[] = [];
    const summary = await runDueRechecks(db.client, 20, {
      now: new Date("2026-09-25T12:00:00.000Z"),
      observe: async (_admin, workspaceId, review) => {
        observed.push(`${workspaceId}:${review.platform}`);
        if (review.platform !== "google") return null; // no connection for this platform
        return { visible: false, detail: "FIXTURE 404", method: "google_business_profile_api" };
      },
    });
    expect(summary).toMatchObject({ examined: 3, due: 2, performed: 1, skipped: 1, failed: 0 });
    expect(observed).toEqual([`${WS}:google`, `${OTHER_WS}:yelp`]);

    const google = db.tables.removal_cases.find((c) => c.id === "case-due-google")!;
    const ledger = google.evidence.verification.ledger as Ledger;
    expect(ledger.filter((e) => e.phase === "RECHECK").length).toBe(1);
    expect(ledger.find((e) => e.phase === "RECHECK")!.source.type).toBe("provider_api_recheck");
    expect(google.outcome).toBe("removed");
    expect(google.status).toBe("approved");

    const untouched = db.tables.removal_cases.find((c) => c.id === "case-due-noconn")!;
    expect(untouched.evidence.verification.ledger.length).toBe(1);
    expect(untouched.status).toBe("submitted");
  });

  test("an observation that proves nothing writes nothing", async () => {
    const db = memoryAdmin();
    const summary = await runDueRechecks(db.client, 20, {
      now: new Date("2026-09-25T12:00:00.000Z"),
      observe: async () => ({ visible: null, detail: "FIXTURE 503", method: "google_business_profile_api" }),
    });
    expect(summary.performed).toBe(0);
    for (const c of db.tables.removal_cases) expect(c.evidence.verification.ledger.every((e: LedgerEntry) => e.phase !== "RECHECK")).toBe(true);
  });

  test("the provider-call budget is respected", async () => {
    const db = memoryAdmin();
    const summary = await runDueRechecks(db.client, 0, {
      now: new Date("2026-09-25T12:00:00.000Z"),
      observe: async () => ({ visible: true, detail: "x", method: "m" }),
    });
    expect(summary.performed).toBe(0);
    expect(summary.skipped).toBe(2);
  });
});

test("a resubmission after the platform answered is new, even inside the window", () => {
  const detail = "route=platform_policy_report; channel=manual_provider_interface";
  const ledger: Ledger = [submission("2026-09-25T10:00:00.000Z", detail), response("2026-09-25T10:03:00.000Z", "rejected")];
  expect(findRecentDuplicate(ledger, submission("2026-09-25T10:06:00.000Z", detail))).toBeNull();
});
