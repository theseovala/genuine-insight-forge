/**
 * Isolated tests for the removal pipeline.
 *
 * These run entirely on in-memory fixtures. Nothing here opens a database
 * connection, calls a provider, calls a model, or writes a row — so no fake
 * review, case, provider response or outcome can reach a production table.
 *
 * Run with: bun test tests/
 */

import { describe, expect, test } from "bun:test";
import { deriveReviewUrl } from "../src/lib/removal/review-url";
import { detectRoutes, primaryRoute } from "../src/lib/removal/routes";
import {
  appendEntry,
  assertOutcomeSupported,
  assertTransition,
  canTransition,
  nextRecheckDue,
  phaseProgress,
  providerDecision,
  resolveOutcome,
  type Ledger,
  type LedgerEntry,
} from "../src/lib/removal/lifecycle";
import {
  buildEvidencePackage,
  resealWithLedger,
  sha256,
  validateEvidencePackage,
  verifyPackageIntegrity,
  type EvidencePackage,
} from "../src/lib/removal/evidence.server";

// ---------------------------------------------------------------------------
// Fixtures. Invented text, used only in memory, clearly marked as a fixture.
// ---------------------------------------------------------------------------

const FIXTURE_REVIEW = {
  id: "11111111-1111-4111-8111-111111111111",
  platform: "google",
  externalId: "gbp:LOC_FIXTURE:REV_FIXTURE",
  author: "Fixture Reviewer",
  rating: 1,
  body: "FIXTURE TEXT: buy cheap followers at example-spam.test, best prices",
  externalCreatedAt: "2026-09-01T10:00:00.000Z",
};

const FIXTURE_PLACE_ID = "ChIJFixturePlaceIdValue";
const FROZEN_NOW = new Date("2026-09-22T12:00:00.000Z");

const NO_CAPABILITY = { providerApiApproved: false, legalSourceConnected: false };

function buildFixturePackage(
  ledger: Ledger = [],
  violation = "spam_or_advertising",
): EvidencePackage {
  const url = deriveReviewUrl({ platform: "google", placeId: FIXTURE_PLACE_ID });
  return buildEvidencePackage({
    review: {
      ...FIXTURE_REVIEW,
      url: url.url,
      urlPrecision: url.precision,
      urlDerivation: url.derivation,
      urlPatternSource: url.patternSource,
    },
    finding: {
      violationType: violation,
      confidence: 0.91,
      explanation:
        "The review advertises an unrelated service instead of describing a customer experience.",
      model: "openai/gpt-4.1",
    },
    routes: detectRoutes({ platform: "google", violation, capability: NO_CAPABILITY }),
    ledger,
    legalSourceConnected: false,
    now: FROZEN_NOW,
  });
}

function entry(
  partial: Partial<LedgerEntry> & { phase: LedgerEntry["phase"]; at: string },
): LedgerEntry {
  return {
    actor: { kind: "system", id: null },
    observation: "fixture entry",
    source: { type: "fixture", detail: "in-memory test" },
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// 1. review_url derivation
// ---------------------------------------------------------------------------

describe("review URL derivation", () => {
  test("uses a provider-supplied permalink at full precision", () => {
    const result = deriveReviewUrl({
      platform: "google",
      providerUrl: "https://example.test/review/1",
    });
    expect(result.url).toBe("https://example.test/review/1");
    expect(result.precision).toBe("review_permalink");
    expect(result.derivation).toBe("provider_supplied");
  });

  test("derives a place link from a real place id, declared at location precision", () => {
    const result = deriveReviewUrl({ platform: "google", placeId: FIXTURE_PLACE_ID });
    expect(result.url).toBe(`https://www.google.com/maps/place/?q=place_id:${FIXTURE_PLACE_ID}`);
    expect(result.precision).toBe("location_reviews");
    expect(result.patternSource).toContain("developers.google.com");
  });

  test("never invents a URL when the provider gave nothing", () => {
    const result = deriveReviewUrl({ platform: "google" });
    expect(result.url).toBeNull();
    expect(result.precision).toBe("unavailable");
    expect(result.reason).toBe("PROVIDER_DATA_UNAVAILABLE");
  });

  test("refuses to treat a resource name as a place id", () => {
    const result = deriveReviewUrl({ platform: "google", placeId: "accounts/123/locations/456" });
    expect(result.url).toBeNull();
    expect(result.precision).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// 2. route detection
// ---------------------------------------------------------------------------

describe("route detection", () => {
  test("puts the platform policy report first and marks it manual for Google", () => {
    const routes = detectRoutes({
      platform: "google",
      violation: "spam_or_advertising",
      capability: NO_CAPABILITY,
    });
    expect(primaryRoute(routes)).toBe("platform_policy_report");
    expect(routes[0]!.actionState).toBe("MANUAL_ACTION_REQUIRED");
    expect(routes[0]!.blockedBy).toContain("no API for reporting");
  });

  test("reports the reply route as blocked on provider approval, not as available", () => {
    const routes = detectRoutes({
      platform: "google",
      violation: "off_topic",
      capability: NO_CAPABILITY,
    });
    const reply = routes.find((r) => r.route === "public_reply_mitigation")!;
    expect(reply.actionState).toBe("PROVIDER_APPROVAL_REQUIRED");
  });

  test("turns the reply route available only once provider access is approved", () => {
    const routes = detectRoutes({
      platform: "google",
      violation: "off_topic",
      capability: { providerApiApproved: true, legalSourceConnected: false },
    });
    expect(routes.find((r) => r.route === "public_reply_mitigation")!.actionState).toBe(
      "PROVIDER_API_AVAILABLE",
    );
  });

  test("marks legal routes LEGAL_SOURCE_REQUIRED and names no authority", () => {
    const routes = detectRoutes({
      platform: "google",
      violation: "hate_or_harassment",
      capability: NO_CAPABILITY,
    });
    const legal = routes.filter(
      (r) =>
        r.route.startsWith("legal") ||
        r.route === "regulator_complaint" ||
        r.route === "court_order_evidence",
    );
    expect(legal.length).toBe(3);
    for (const route of legal) expect(route.actionState).toBe("LEGAL_SOURCE_REQUIRED");
  });

  test("offers no legal route for a violation that does not warrant one", () => {
    const routes = detectRoutes({
      platform: "google",
      violation: "off_topic",
      capability: NO_CAPABILITY,
    });
    expect(routes.some((r) => r.route === "legal_removal_request")).toBe(false);
  });

  test("offers the appeal route only after a real provider rejection", () => {
    const before = detectRoutes({
      platform: "google",
      violation: "off_topic",
      capability: NO_CAPABILITY,
    });
    expect(before.some((r) => r.route === "platform_appeal")).toBe(false);
    const after = detectRoutes({
      platform: "google",
      violation: "off_topic",
      capability: NO_CAPABILITY,
      priorRejection: true,
    });
    expect(after.some((r) => r.route === "platform_appeal")).toBe(true);
  });

  test("never cites a policy URL it did not retrieve", () => {
    const routes = detectRoutes({
      platform: "google",
      violation: "fake_or_incentivised",
      capability: NO_CAPABILITY,
    });
    for (const route of routes) expect(route.policyBasis.source).toBe("POLICY_SOURCE_REQUIRED");
  });

  test("returns nothing for a violation label outside the fixed list", () => {
    expect(
      detectRoutes({
        platform: "google",
        violation: "invented_violation",
        capability: NO_CAPABILITY,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. evidence package
// ---------------------------------------------------------------------------

describe("evidence package", () => {
  test("is deterministic: the same inputs seal to the same hash", () => {
    expect(buildFixturePackage().integrity.packageSha256).toBe(
      buildFixturePackage().integrity.packageSha256,
    );
  });

  test("hashes the review text and validates the hash", () => {
    const pkg = buildFixturePackage();
    expect(pkg.review.bodySha256).toBe(sha256(FIXTURE_REVIEW.body));
    expect(verifyPackageIntegrity(pkg)).toBe(true);
  });

  test("detects tampering with the review text after sealing", () => {
    const pkg = buildFixturePackage();
    const tampered = { ...pkg, review: { ...pkg.review, capturedBody: "different text" } };
    expect(verifyPackageIntegrity(tampered)).toBe(false);
    expect(() => validateEvidencePackage(tampered)).toThrow(/hash does not match/);
  });

  test("every item carries source, timestamp, confidence and explanation", () => {
    for (const item of buildFixturePackage().items) {
      expect(item.source.type.length).toBeGreaterThan(0);
      expect(item.source.detail.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(item.timestamp))).toBe(false);
      expect(item.confidence).toBeGreaterThanOrEqual(0);
      expect(item.confidence).toBeLessThanOrEqual(1);
      expect(item.explanation.length).toBeGreaterThan(0);
    }
  });

  test("labels the AI verdict as an assessment and names the model", () => {
    const item = buildFixturePackage().items.find((i) => i.id === "policy_classification")!;
    expect(item.source.type).toBe("ai_classification");
    expect(item.source.detail).toContain("gpt-4.1");
    expect(item.source.url).toBeNull();
  });

  test("gives an uncited policy basis a confidence of zero", () => {
    const items = buildFixturePackage().items.filter((i) => i.id.startsWith("policy_basis_"));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.value).toBe("POLICY_SOURCE_REQUIRED");
      expect(item.confidence).toBe(0);
    }
  });

  test("records an unavailable link honestly instead of guessing one", () => {
    const url = deriveReviewUrl({ platform: "trustpilot" });
    const pkg = buildEvidencePackage({
      review: {
        ...FIXTURE_REVIEW,
        platform: "trustpilot",
        url: url.url,
        urlPrecision: url.precision,
        urlDerivation: url.derivation,
        urlPatternSource: url.patternSource,
      },
      finding: {
        violationType: "off_topic",
        confidence: 0.5,
        explanation: "Fixture explanation.",
        model: null,
      },
      routes: detectRoutes({
        platform: "trustpilot",
        violation: "off_topic",
        capability: NO_CAPABILITY,
      }),
      ledger: [],
      legalSourceConnected: false,
      now: FROZEN_NOW,
    });
    const item = pkg.items.find((i) => i.id === "review_location")!;
    expect(item.value).toBe("PROVIDER_DATA_UNAVAILABLE");
    expect(pkg.review.url).toBeNull();
  });

  test("starts with LEGAL_SOURCE_REQUIRED and no authorities", () => {
    const pkg = buildFixturePackage();
    expect(pkg.legal.status).toBe("LEGAL_SOURCE_REQUIRED");
    expect(pkg.legal.authorities).toEqual([]);
  });

  test("refuses a package that lists a legal authority with no legal source", () => {
    const pkg = buildFixturePackage();
    const forged = {
      ...pkg,
      legal: {
        ...pkg.legal,
        authorities: [
          {
            name: "Fixture Act",
            citation: "s.1",
            url: "https://example.test",
            retrievedAt: FROZEN_NOW.toISOString(),
            jurisdiction: "XX",
          },
        ],
      },
    };
    expect(() => validateEvidencePackage(forged)).toThrow(/no authorised legal source/);
  });

  test("refuses an empty package", () => {
    const pkg = buildFixturePackage();
    expect(() => validateEvidencePackage({ ...pkg, items: [] })).toThrow(
      /no items is not evidence/,
    );
  });
});

// ---------------------------------------------------------------------------
// 4. lifecycle transitions
// ---------------------------------------------------------------------------

describe("case lifecycle", () => {
  test("allows the transitions the existing UI offers", () => {
    expect(canTransition("flagged", "submitted")).toBe(true);
    expect(canTransition("submitted", "approved")).toBe(true);
    expect(canTransition("submitted", "rejected")).toBe(true);
    expect(canTransition("flagged", "dismissed")).toBe(true);
  });

  test("refuses to skip submission or to reopen a closed case", () => {
    expect(canTransition("flagged", "approved")).toBe(false);
    expect(canTransition("approved", "submitted")).toBe(false);
    expect(canTransition("dismissed", "submitted")).toBe(false);
    expect(() => assertTransition("flagged", "approved")).toThrow(
      /cannot move from flagged to approved/,
    );
  });

  test("allows resubmission after a provider rejection", () => {
    expect(canTransition("rejected", "submitted")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. verification loop — the rule that matters most
// ---------------------------------------------------------------------------

describe("BEFORE -> SUBMISSION -> RESPONSE -> RECHECK -> AFTER", () => {
  test("an unopened case establishes nothing", () => {
    expect(resolveOutcome([]).outcome).toBe("unverified");
  });

  test("a generated report does not establish removal", () => {
    const ledger = [
      entry({ phase: "BEFORE", at: "2026-09-20T10:00:00.000Z", observation: "case opened" }),
    ];
    expect(resolveOutcome(ledger).outcome).toBe("unverified");
  });

  test("a submission alone does not establish removal", () => {
    const ledger = [
      entry({ phase: "BEFORE", at: "2026-09-20T10:00:00.000Z" }),
      entry({
        phase: "SUBMISSION",
        at: "2026-09-20T11:00:00.000Z",
        observation: "report filed via provider interface",
      }),
    ];
    const resolved = resolveOutcome(ledger);
    expect(resolved.outcome).toBe("unverified");
    expect(resolved.basis).toContain("No provider response and no recheck");
  });

  test("a provider claiming removal does not establish removal", () => {
    const ledger = [
      entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" }),
      entry({
        phase: "RESPONSE",
        at: "2026-09-21T09:00:00.000Z",
        providerResponse: {
          channel: "provider_interface",
          verbatim: "FIXTURE: your report was actioned",
          reference: null,
          decision: "accepted",
          receivedAt: "2026-09-21T09:00:00.000Z",
        },
      }),
    ];
    expect(resolveOutcome(ledger).outcome).toBe("unverified");
    expect(providerDecision(ledger)).toBe("accepted");
  });

  test("only a recheck that finds the review gone establishes removal", () => {
    const ledger = [
      entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" }),
      entry({
        phase: "RECHECK",
        at: "2026-09-22T09:00:00.000Z",
        reviewVisible: false,
        observation: "review not present on the place page",
        source: { type: "recheck_observation", detail: "fixture recheck" },
      }),
    ];
    const resolved = resolveOutcome(ledger);
    expect(resolved.outcome).toBe("removed");
    expect(resolved.outcomeAt).toBe("2026-09-22T09:00:00.000Z");
  });

  test("a recheck overrides a provider that claimed removal", () => {
    const ledger = [
      entry({
        phase: "RESPONSE",
        at: "2026-09-21T09:00:00.000Z",
        providerResponse: {
          channel: "provider_interface",
          verbatim: "FIXTURE: removed",
          reference: null,
          decision: "accepted",
          receivedAt: "2026-09-21T09:00:00.000Z",
        },
      }),
      entry({ phase: "RECHECK", at: "2026-09-22T09:00:00.000Z", reviewVisible: true }),
    ];
    expect(resolveOutcome(ledger).outcome).toBe("retained");
  });

  test("a recheck after a rejection can still establish removal", () => {
    const ledger = [
      entry({
        phase: "RESPONSE",
        at: "2026-09-21T09:00:00.000Z",
        providerResponse: {
          channel: "provider_interface",
          verbatim: "FIXTURE: no violation found",
          reference: null,
          decision: "rejected",
          receivedAt: "2026-09-21T09:00:00.000Z",
        },
      }),
      entry({ phase: "RECHECK", at: "2026-09-23T09:00:00.000Z", reviewVisible: false }),
    ];
    expect(resolveOutcome(ledger).outcome).toBe("removed");
    expect(providerDecision(ledger)).toBe("rejected");
  });

  test("a recheck that could not observe the review establishes nothing", () => {
    const ledger = [
      entry({ phase: "RECHECK", at: "2026-09-22T09:00:00.000Z", reviewVisible: null }),
    ];
    expect(resolveOutcome(ledger).outcome).toBe("unverified");
  });

  test("writing an unsupported outcome is refused", () => {
    const ledger = [entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" })];
    expect(() => assertOutcomeSupported(ledger, "removed")).toThrow(
      /not supported by the case evidence/,
    );
    expect(() => assertOutcomeSupported(ledger, "unverified")).not.toThrow();
  });

  test("tracks which phases have actually been recorded", () => {
    const ledger = appendEntry(
      [entry({ phase: "BEFORE", at: "2026-09-20T10:00:00.000Z" })],
      entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" }),
    );
    expect(phaseProgress(ledger)).toEqual({
      BEFORE: true,
      SUBMISSION: true,
      RESPONSE: false,
      RECHECK: false,
      AFTER: false,
    });
  });

  test("keeps the ledger ordered oldest first however entries arrive", () => {
    const ledger = appendEntry(
      [entry({ phase: "RECHECK", at: "2026-09-22T09:00:00.000Z", reviewVisible: true })],
      entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" }),
    );
    expect(ledger.map((e) => e.phase)).toEqual(["SUBMISSION", "RECHECK"]);
  });

  test("schedules a follow-up recheck while nothing is verified, and stops once removed", () => {
    const open = [entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" })];
    expect(nextRecheckDue(open, 72)).toBe("2026-09-23T11:00:00.000Z");
    const done = [
      entry({ phase: "RECHECK", at: "2026-09-22T09:00:00.000Z", reviewVisible: false }),
    ];
    expect(nextRecheckDue(done)).toBeNull();
    expect(nextRecheckDue([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. the package follows the ledger
// ---------------------------------------------------------------------------

describe("resealing the package as the case progresses", () => {
  test("a fresh package reports an unverified outcome", () => {
    const pkg = buildFixturePackage();
    expect(pkg.verification.outcome).toBe("unverified");
    expect(pkg.verification.phases.RECHECK).toBe(false);
  });

  test("resealing carries the evidence over and updates only the verification block", () => {
    const pkg = buildFixturePackage();
    const ledger: Ledger = [
      entry({ phase: "SUBMISSION", at: "2026-09-20T11:00:00.000Z" }),
      entry({ phase: "RECHECK", at: "2026-09-22T09:00:00.000Z", reviewVisible: false }),
    ];
    const resealed = resealWithLedger(pkg, ledger);
    expect(resealed.review).toEqual(pkg.review);
    expect(resealed.items).toEqual(pkg.items);
    expect(resealed.verification.outcome).toBe("removed");
    expect(resealed.integrity.packageSha256).not.toBe(pkg.integrity.packageSha256);
    expect(verifyPackageIntegrity(resealed)).toBe(true);
  });
});
