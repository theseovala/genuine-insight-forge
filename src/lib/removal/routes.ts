/**
 * Legitimate route detection.
 *
 * Given a policy violation the classifier found, this decides which legitimate
 * routes the case actually qualifies for and — the important part — what can
 * honestly be done about each one right now. Nothing here predicts an outcome
 * and nothing here asserts a law.
 *
 * Two deliberate omissions:
 *
 *  1. No policy URL is hard-coded. A policy citation is only worth anything if
 *     the document behind it was really retrieved and stored, so each route
 *     names the rule it relies on and leaves the source as
 *     POLICY_SOURCE_REQUIRED until a retrieved document is attached.
 *
 *  2. No statute, regulator or judgment is named. The legal routes exist as
 *     structure so an authorised legal source can be connected later, and they
 *     report LEGAL_SOURCE_REQUIRED until then.
 */

import { VIOLATIONS } from "@/lib/removal-scan.server";
import type { PolicyCitation, PolicyLookup } from "./policy-sources.server";

export const ROUTES = [
  "platform_policy_report",
  "platform_appeal",
  "business_support_escalation",
  "public_reply_mitigation",
  "legal_removal_request",
  "regulator_complaint",
  "court_order_evidence",
] as const;

export type Route = (typeof ROUTES)[number];

/**
 * What can truthfully happen on this route at this moment.
 *
 *  PROVIDER_API_AVAILABLE     the provider publishes an endpoint and we hold
 *                             approved access, so the system can act
 *  PROVIDER_APPROVAL_REQUIRED an endpoint exists but provider access is not
 *                             approved for this client yet
 *  MANUAL_ACTION_REQUIRED     the provider publishes no endpoint for this
 *                             route; a person has to submit it through the
 *                             provider's own interface
 *  LEGAL_SOURCE_REQUIRED      the route depends on a legal authority that no
 *                             authorised source has supplied
 */
export type ActionState =
  | "PROVIDER_API_AVAILABLE"
  | "PROVIDER_APPROVAL_REQUIRED"
  | "MANUAL_ACTION_REQUIRED"
  | "LEGAL_SOURCE_REQUIRED";

export type PolicyBasis = {
  /** The rule this route relies on, by name. Never a fabricated citation. */
  ruleName: string;
  /** Set once a retrieved policy document is attached; until then, the marker. */
  source:
    { url: string; retrievedAt: string; jurisdiction: string | null } | "POLICY_SOURCE_REQUIRED";
  /**
   * Whether the official policy document was retrieved and actually contains a
   * section for this violation. Absent on packages sealed before citations existed.
   */
  citationStatus?: "CITED" | "NO_SUPPORTED_POLICY_ROUTE";
  /** The retrieved section, only when citationStatus is CITED. */
  citation?: PolicyCitation;
  /** Why nothing is cited, only when citationStatus is NO_SUPPORTED_POLICY_ROUTE. */
  citationReason?: string;
};

/**
 * An official place a person files the route, verified reachable while this
 * was built. Only listed when the URL was fetched and answered 200.
 */
export type OfficialDestination = { url: string; title: string; verifiedAt: string };

/** HUMAN_ACTION_REQUIRED: what a person has to do for a route no endpoint can carry out. */
export type HumanAction = {
  required: true;
  /** null when no official destination URL has been verified for this platform and route. */
  destination: OfficialDestination | null;
  whatToSubmit: string;
  /** Evidence item ids from the package that should accompany the submission. */
  evidenceRequired: string[];
};

export type DetectedRoute = {
  route: Route;
  /** 1 is tried first. Ordering is by how directly the route addresses the violation. */
  rank: number;
  actionState: ActionState;
  policyBasis: PolicyBasis;
  /** Why this route applies to this violation. Plain, checkable reasoning. */
  reason: string;
  /** What has to happen for the route to become actionable, when it is not. */
  blockedBy: string | null;
  /** Present on routes a person has to file themselves (HUMAN_ACTION_REQUIRED). */
  humanAction?: HumanAction;
};

export type Capability = {
  /** True only when the provider has approved API access for this OAuth client. */
  providerApiApproved: boolean;
  /** True only when an authorised legal source is connected. */
  legalSourceConnected: boolean;
};

/**
 * Which violations justify considering a legal route. This is a routing
 * heuristic about which cases a lawyer should look at — it is not a legal
 * opinion, and the route still reports LEGAL_SOURCE_REQUIRED.
 */
const LEGAL_REVIEW_WORTH_CONSIDERING = new Set<string>([
  "fake_or_incentivised",
  "hate_or_harassment",
  "personal_information",
]);

const RULE_NAMES: Record<string, string> = {
  fake_or_incentivised: "Platform prohibition on fake, incentivised or misrepresented experiences",
  spam_or_advertising: "Platform prohibition on spam and advertising in user contributions",
  hate_or_harassment: "Platform prohibition on hate speech and harassment",
  profanity_or_obscenity: "Platform prohibition on obscenity and profanity",
  off_topic: "Platform requirement that a contribution describe the customer experience",
  conflict_of_interest: "Platform prohibition on contributions with a conflict of interest",
  personal_information: "Platform prohibition on publishing another person's personal information",
};

function basisFor(violation: string): PolicyBasis {
  return {
    ruleName: RULE_NAMES[violation] ?? "Platform content policy",
    source: "POLICY_SOURCE_REQUIRED",
  };
}

/**
 * The basis for the platform routes. A retrieved citation replaces the
 * POLICY_SOURCE_REQUIRED marker only when the lookup really found the section;
 * a failed lookup is recorded as NO_SUPPORTED_POLICY_ROUTE with its reason.
 * Without any lookup the basis is exactly what it was before citations existed.
 */
function citedBasisFor(violation: string, lookup: PolicyLookup | null | undefined): PolicyBasis {
  const basis = basisFor(violation);
  if (!lookup) return basis;
  if (lookup.status === "CITED" && lookup.citation.violation === violation) {
    return {
      ...basis,
      source: { url: lookup.citation.finalUrl, retrievedAt: lookup.citation.retrievedAt, jurisdiction: null },
      citationStatus: "CITED",
      citation: lookup.citation,
    };
  }
  return {
    ...basis,
    citationStatus: "NO_SUPPORTED_POLICY_ROUTE",
    citationReason: lookup.status === "NO_SUPPORTED_POLICY_ROUTE" ? lookup.reason : "The citation was for a different violation.",
  };
}

/**
 * Official human-action destinations. Each URL here was fetched during
 * implementation and answered HTTP 200 with the title recorded. Nothing is
 * listed for a platform or route that was not verified that way.
 */
export const OFFICIAL_DESTINATIONS: Record<string, Partial<Record<Route, OfficialDestination>>> = {
  google: {
    platform_policy_report: {
      url: "https://support.google.com/business/workflow/9945796",
      title: "Manage your Google Business reviews - Google Business Profile Help",
      verifiedAt: "2026-09-25",
    },
  },
};

const EVIDENCE_FOR_FILING = ["review_content", "review_content_hash", "review_identity", "review_location", "policy_classification"];

function humanActionFor(platform: string, route: Route, basis: PolicyBasis): HumanAction {
  const cited =
    basis.citationStatus === "CITED" && basis.citation
      ? `the policy section "${basis.citation.section}" of "${basis.citation.title}"`
      : "the policy category named in the package (no retrieved section could be cited)";
  const what: Partial<Record<Route, string>> = {
    platform_policy_report: `Report the review through ${platform}'s own reporting flow, choosing the reason that matches ${cited}. Include the captured review text and identifiers from the evidence package.`,
    platform_appeal: `Appeal the decision through ${platform}'s own appeal flow, quoting the platform's answer, the captured review text and ${cited}.`,
    business_support_escalation: `Contact ${platform} business support with the report reference, the captured review text and ${cited}.`,
  };
  return {
    required: true,
    destination: OFFICIAL_DESTINATIONS[platform]?.[route] ?? null,
    whatToSubmit: what[route] ?? "Submit through the platform's own interface.",
    evidenceRequired: [...EVIDENCE_FOR_FILING, `policy_basis_${route}`],
  };
}

/**
 * The only provider action this codebase implements against a real endpoint is
 * publishing a public reply, via `postGoogleReviewReply`. Google publishes no
 * API for reporting a review or appealing a decision, so those routes are
 * manual and are reported as such rather than being faked.
 */
function replyActionState(
  platform: string,
  capability: Capability,
): { state: ActionState; blockedBy: string | null } {
  if (platform !== "google") {
    return {
      state: "MANUAL_ACTION_REQUIRED",
      blockedBy: `No reply endpoint is implemented for ${platform}.`,
    };
  }
  if (!capability.providerApiApproved) {
    return {
      state: "PROVIDER_APPROVAL_REQUIRED",
      blockedBy: "Google Business Profile API access is not approved for this OAuth client.",
    };
  }
  return { state: "PROVIDER_API_AVAILABLE", blockedBy: null };
}

const LEGAL_ROUTES: Array<{ route: Route; reason: string }> = [
  {
    route: "legal_removal_request",
    reason:
      "The violation involves a false statement of fact or identifiable personal harm, which a lawyer may be able to raise directly with the platform.",
  },
  {
    route: "regulator_complaint",
    reason: "Some jurisdictions give a regulator authority over this category of content.",
  },
  {
    route: "court_order_evidence",
    reason:
      "If every other route is exhausted, the evidence package is what a court filing would rest on.",
  },
];

export function detectRoutes(input: {
  platform: string;
  violation: string;
  capability: Capability;
  /** True when the provider has already rejected a report on this case. */
  priorRejection?: boolean;
  /**
   * The result of looking the violation up in the platform's retrieved policy
   * document. Omitted: the platform routes stay POLICY_SOURCE_REQUIRED.
   */
  policyLookup?: PolicyLookup | null;
}): DetectedRoute[] {
  const { platform, violation, capability } = input;
  if (!(VIOLATIONS as readonly string[]).includes(violation)) return [];

  // The legal routes keep the uncited basis: a platform policy is not a legal authority.
  const basis = basisFor(violation);
  const platformBasis = citedBasisFor(violation, input.policyLookup);
  const detected: DetectedRoute[] = [];

  // 1. The platform's own policy report. Always first: it is the channel the
  //    platform itself designates, and it costs the client nothing.
  detected.push({
    route: "platform_policy_report",
    rank: 1,
    actionState: "MANUAL_ACTION_REQUIRED",
    policyBasis: platformBasis,
    reason:
      platformBasis.citationStatus === "CITED" && platformBasis.citation
        ? `The AI classifier proposed ${violation} as a candidate violation. The retrieved policy section "${platformBasis.citation.section}" covers that category; a person should confirm the review fits it before filing.`
        : `The AI classifier proposed ${violation} as a candidate violation of the platform content policy; a person should confirm it before filing.`,
    blockedBy:
      platform === "google"
        ? "Google publishes no API for reporting a review. The report has to be filed through the Google reviews management interface."
        : `No reporting API is implemented for ${platform}.`,
    humanAction: humanActionFor(platform, "platform_policy_report", platformBasis),
  });

  // 2. An appeal only exists once the platform has actually decided against us.
  if (input.priorRejection) {
    detected.push({
      route: "platform_appeal",
      rank: 2,
      actionState: "MANUAL_ACTION_REQUIRED",
      policyBasis: platformBasis,
      reason: "The platform rejected the initial report, so its appeal channel becomes available.",
      blockedBy: "An appeal has to be submitted through the platform's own interface.",
      humanAction: humanActionFor(platform, "platform_appeal", platformBasis),
    });
  }

  // 3. Support escalation. Legitimate, and also manual everywhere.
  detected.push({
    route: "business_support_escalation",
    rank: input.priorRejection ? 3 : 2,
    actionState: "MANUAL_ACTION_REQUIRED",
    policyBasis: platformBasis,
    reason:
      "Platform support can escalate a policy report that the automated review did not action.",
    blockedBy:
      "Support escalation is a human conversation with the platform; no endpoint exists for it.",
    humanAction: humanActionFor(platform, "business_support_escalation", platformBasis),
  });

  // 4. Public reply. Removes nothing, but it is the one route that can act
  //    through a real endpoint, and it limits damage while the report is open.
  const reply = replyActionState(platform, capability);
  detected.push({
    route: "public_reply_mitigation",
    rank: input.priorRejection ? 4 : 3,
    actionState: reply.state,
    policyBasis: basis,
    reason:
      "A calm public reply limits the reputational damage while the report is outstanding. It does not remove the review.",
    blockedBy: reply.blockedBy,
  });

  // 5-7. Legal routes: structure only, no authority asserted.
  if (LEGAL_REVIEW_WORTH_CONSIDERING.has(violation)) {
    const legalState: ActionState = capability.legalSourceConnected
      ? "MANUAL_ACTION_REQUIRED"
      : "LEGAL_SOURCE_REQUIRED";
    const legalBlocked = capability.legalSourceConnected
      ? "A qualified lawyer has to approve the filing before it leaves the system."
      : "No authorised legal source is connected, so no legal basis can be stated.";
    const base = input.priorRejection ? 5 : 4;
    LEGAL_ROUTES.forEach((entry, offset) => {
      detected.push({
        route: entry.route,
        rank: base + offset,
        actionState: legalState,
        policyBasis: basis,
        reason: entry.reason,
        blockedBy: legalBlocked,
      });
    });
  }

  return detected.sort((a, b) => a.rank - b.rank);
}

/** The route that should be attempted first. null when the violation is unknown. */
export function primaryRoute(routes: DetectedRoute[]): Route | null {
  return routes.length > 0 ? routes[0]!.route : null;
}

/**
 * The policy lookup already sealed into a case's routes, so re-detecting the
 * routes (e.g. once the appeal opens) keeps the citation that was actually
 * retrieved instead of dropping it or fetching a different version silently.
 */
export function lookupFromRoutes(routes: DetectedRoute[] | null | undefined): PolicyLookup | null {
  const basis = (routes ?? []).find((r) => r.route === "platform_policy_report")?.policyBasis;
  if (basis?.citationStatus === "CITED" && basis.citation) return { status: "CITED", citation: basis.citation };
  if (basis?.citationStatus === "NO_SUPPORTED_POLICY_ROUTE") {
    return { status: "NO_SUPPORTED_POLICY_ROUTE", reason: basis.citationReason ?? "No retrieved section covers this violation." };
  }
  return null;
}

/** Routes that must pass the human approval gate before a submission is recorded. */
export const HUMAN_APPROVAL_ROUTES: readonly Route[] = ["legal_removal_request", "regulator_complaint", "court_order_evidence"];

export function requiresHumanApproval(route: string): boolean {
  return (HUMAN_APPROVAL_ROUTES as readonly string[]).includes(route);
}

/**
 * The human approval gate. A legal, regulator or court submission is recorded
 * only for a workspace owner or admin who explicitly confirms that a person
 * approved it. Throws otherwise; other routes pass through.
 */
export function assertHumanApproval(input: { route: string; role: string; humanApproved?: boolean | undefined }): void {
  if (!requiresHumanApproval(input.route)) return;
  if (input.role !== "owner" && input.role !== "admin") {
    throw new Error("Only a workspace owner or admin can record a legal, regulator or court submission.");
  }
  if (input.humanApproved !== true) {
    throw new Error("Confirm that this legal submission was approved by a person before recording it.");
  }
}
