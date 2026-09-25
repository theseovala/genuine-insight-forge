/**
 * Pure unit tests for the review-link precision, rejection routing, recheck and
 * Google connection-status fixes. In-memory fixtures only: no database, no
 * provider call, no model call, no row written anywhere.
 *
 * Run with: bun test tests/
 */

import { describe, expect, test } from "bun:test";
import { deriveReviewUrl, resolveStoredReviewUrl } from "../src/lib/removal/review-url";
import { detectRoutes } from "../src/lib/removal/routes";
import { hasPriorRejection, type Ledger } from "../src/lib/removal/lifecycle";
import {
  buildEvidencePackage,
  resealWithRoutes,
  verifyPackageIntegrity,
} from "../src/lib/removal/evidence.server";
import { visibilityFromStatus } from "../src/lib/removal/recheck.server";
import {
  BUSINESS_MANAGE_SCOPE,
  classifyGoogle403,
  hasBusinessScope,
  MAX_REVIEWS_PER_LOCATION,
} from "../src/lib/google-business-sync.server";

const FIXTURE_PLACE_ID = "ChIJFixturePlaceIdValue";
const PLACE_LINK = `https://www.google.com/maps/place/?q=place_id:${FIXTURE_PLACE_ID}`;
const NO_CAPABILITY = { providerApiApproved: false, legalSourceConnected: false };
const FROZEN_NOW = new Date("2026-09-22T12:00:00.000Z");

describe("stored review link precision", () => {
  test("a stored Google place link is a listing link, not a review permalink", () => {
    const link = resolveStoredReviewUrl({ platform: "google", storedUrl: PLACE_LINK });
    expect(link.url).toBe(PLACE_LINK);
    expect(link.precision).toBe("location_reviews");
    expect(link.derivation).toBe("derived_from_place_id");
    expect(link.patternSource).toContain("developers.google.com");
  });

  test("only a recognised single-review URL is called a permalink", () => {
    const url = "https://www.trustpilot.com/reviews/64f1c2a3b4c5d6e7f8a9b0c1";
    const link = resolveStoredReviewUrl({ platform: "trustpilot", storedUrl: url });
    expect(link.precision).toBe("review_permalink");
    expect(link.derivation).toBe("provider_supplied");
  });

  test("an unrecognised stored link is kept but not presented as a permalink", () => {
    const link = resolveStoredReviewUrl({ platform: "facebook", storedUrl: "https://example.test/page/1" });
    expect(link.url).toBe("https://example.test/page/1");
    expect(link.precision).toBe("location_reviews");
    expect(link.derivation).toBe("stored_link_unclassified");
  });

  test("with no stored link the place id feeds the fallback derivation", () => {
    const link = resolveStoredReviewUrl({ platform: "google", storedUrl: null, placeId: FIXTURE_PLACE_ID });
    expect(link.url).toBe(PLACE_LINK);
    expect(link.precision).toBe("location_reviews");
  });

  test("with neither a stored link nor a place id nothing is invented", () => {
    const link = resolveStoredReviewUrl({ platform: "google", storedUrl: null, placeId: "locations/123" });
    expect(link.url).toBeNull();
    expect(link.precision).toBe("unavailable");
  });

  test("the evidence package states a listing link at listing confidence", () => {
    const link = resolveStoredReviewUrl({ platform: "google", storedUrl: PLACE_LINK });
    const pkg = buildEvidencePackage({
      review: {
        id: "11111111-1111-4111-8111-111111111111",
        platform: "google",
        externalId: "gbp:LOC_FIXTURE:REV_FIXTURE",
        author: "Fixture Reviewer",
        rating: 1,
        body: "FIXTURE TEXT: spam",
        externalCreatedAt: "2026-09-01T10:00:00.000Z",
        url: link.url,
        urlPrecision: link.precision,
        urlDerivation: link.derivation,
        urlPatternSource: link.patternSource,
      },
      finding: { violationType: "spam_or_advertising", confidence: 0.9, explanation: "fixture", model: "fixture/model" },
      routes: detectRoutes({ platform: "google", violation: "spam_or_advertising", capability: NO_CAPABILITY }),
      ledger: [],
      legalSourceConnected: false,
      now: FROZEN_NOW,
    });
    const item = pkg.items.find((i) => i.id === "review_location")!;
    expect(item.confidence).toBe(0.6);
    expect(item.claim).toBe("This link points at the page the review is published on.");
  });
});

describe("prior rejection opens the appeal route", () => {
  const rejectedResponse: Ledger = [
    {
      phase: "RESPONSE",
      at: "2026-09-10T10:00:00.000Z",
      actor: { kind: "provider", id: null },
      observation: "The provider answered: rejected.",
      source: { type: "provider_response", detail: "channel=fixture" },
      providerResponse: { channel: "fixture", verbatim: "FIXTURE: we decline", reference: null, decision: "rejected", receivedAt: "2026-09-10T10:00:00.000Z" },
    },
  ];

  test("a rejected status counts as a prior rejection", () => {
    expect(hasPriorRejection([], "rejected")).toBe(true);
  });

  test("a rejected provider response counts even while the status is submitted", () => {
    expect(hasPriorRejection(rejectedResponse, "submitted")).toBe(true);
  });

  test("an accepted response or no history is not a rejection", () => {
    const accepted: Ledger = [{ ...rejectedResponse[0]!, providerResponse: { ...rejectedResponse[0]!.providerResponse!, decision: "accepted" } }];
    expect(hasPriorRejection(accepted, "submitted")).toBe(false);
    expect(hasPriorRejection([], "flagged")).toBe(false);
  });

  test("re-sealing with rejection-aware routes adds the appeal route and its policy basis, and stays verifiable", () => {
    const pkg = buildEvidencePackage({
      review: {
        id: "11111111-1111-4111-8111-111111111111",
        platform: "google",
        externalId: "gbp:LOC_FIXTURE:REV_FIXTURE",
        author: "Fixture Reviewer",
        rating: 1,
        body: "FIXTURE TEXT: spam",
        externalCreatedAt: "2026-09-01T10:00:00.000Z",
        url: null,
        urlPrecision: "unavailable",
        urlDerivation: "none",
        urlPatternSource: null,
      },
      finding: { violationType: "spam_or_advertising", confidence: 0.9, explanation: "fixture", model: "fixture/model" },
      routes: detectRoutes({ platform: "google", violation: "spam_or_advertising", capability: NO_CAPABILITY }),
      ledger: rejectedResponse,
      legalSourceConnected: false,
      now: FROZEN_NOW,
    });
    expect(pkg.routes.some((r) => r.route === "platform_appeal")).toBe(false);

    const routes = detectRoutes({ platform: "google", violation: "spam_or_advertising", capability: NO_CAPABILITY, priorRejection: hasPriorRejection(rejectedResponse) });
    const next = resealWithRoutes(pkg, routes, FROZEN_NOW);
    expect(next.routes.map((r) => r.route)).toContain("platform_appeal");
    expect(next.items.some((i) => i.id === "policy_basis_platform_appeal")).toBe(true);
    expect(next.items.filter((i) => i.id.startsWith("policy_basis_")).length).toBe(routes.length);
    expect(next.verification.ledger).toEqual(rejectedResponse);
    expect(next.review).toEqual(pkg.review);
    expect(verifyPackageIntegrity(next)).toBe(true);
    expect(next.integrity.packageSha256).not.toBe(pkg.integrity.packageSha256);
  });
});

describe("automatic recheck status reading", () => {
  test("only 2xx and 404 are observations; everything else proves nothing", () => {
    expect(visibilityFromStatus(200)).toBe(true);
    expect(visibilityFromStatus(404)).toBe(false);
    for (const status of [401, 403, 429, 500, 503]) expect(visibilityFromStatus(status)).toBeNull();
  });
});

describe("Google connection status", () => {
  test("sign-in scopes alone are not a Business Profile grant", () => {
    expect(hasBusinessScope(["openid", "https://www.googleapis.com/auth/userinfo.email"])).toBe(false);
    expect(hasBusinessScope(["openid", BUSINESS_MANAGE_SCOPE])).toBe(true);
    expect(hasBusinessScope(null)).toBe(false);
  });

  test("a 403 for missing scopes is told apart from an unapproved API", () => {
    const scope = classifyGoogle403({ error: { code: 403, status: "PERMISSION_DENIED", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } });
    expect(scope.kind).toBe("scope_insufficient");
    expect(scope.message).toContain("reconnect");
    const api = classifyGoogle403('{"error":{"code":403,"status":"PERMISSION_DENIED","message":"quota"}}');
    expect(api.kind).toBe("api_not_approved");
  });

  test("sync reads well past the old 100-review cap per location", () => {
    expect(MAX_REVIEWS_PER_LOCATION).toBeGreaterThan(100);
  });
});

test("the fallback link derivation still refuses a resource name as a place id", () => {
  expect(deriveReviewUrl({ platform: "google", placeId: "accounts/1/locations/2" }).url).toBeNull();
});
