/**
 * Provider rechecks and ledger commits shared by the "Recheck review" button
 * and the scheduled job.
 *
 * One code path does the observing: the Google Business Profile API with a
 * usable token and the business.manage grant, or the Trustpilot Consumer API
 * with a key. When neither can observe the review, or the provider's answer
 * proves nothing (timeouts, 401/403/429/5xx), nothing is written — a guess is
 * never recorded. Every query is scoped by workspace_id.
 */

import { appendEntry, nextRecheckDue, resolveOutcome, statusAfterRecheck, type Ledger } from "./lifecycle";

export type Observation = { visible: boolean | null; detail: string; method: string };

/**
 * Asks the provider whether the review is still published. null when no working
 * connection for the platform exists. Throws only for a Google connection that
 * turned out unusable (after marking it so), mirroring the manual path.
 */
export async function observeReviewVisibility(
  admin: any,
  workspaceId: string,
  review: { platform: string; external_id: string | null },
): Promise<Observation | null> {
  if (review.platform === "google" && typeof review.external_id === "string" && review.external_id.startsWith("gbp:")) {
    const { data: connection } = await admin
      .from("google_business_connections")
      .select("access_token_ciphertext,refresh_token_ciphertext,token_expires_at,status,scopes")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const sync = await import("@/lib/google-business-sync.server");
    if (!connection || connection.status !== "connected" || !sync.hasBusinessScope(connection.scopes)) return null;
    try {
      const token = await sync.usableAccessToken(admin, workspaceId, connection);
      return { ...(await sync.googleReviewVisible(token, review.external_id)), method: "google_business_profile_api" };
    } catch (caught) {
      if (caught instanceof sync.GoogleConnectionUnusableError) await sync.markGoogleConnectionUnusable(admin, workspaceId, caught.message);
      throw caught;
    }
  }
  if (review.platform === "trustpilot" && review.external_id) {
    const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");
    const creds = await loadProviderCredentials(admin, workspaceId, "trustpilot");
    const apiKey = creds["TRUSTPILOT_API_KEY"] ?? process.env["TRUSTPILOT_API_KEY"];
    if (!apiKey) return null;
    const { trustpilotReviewVisible } = await import("./recheck.server");
    return { ...(await trustpilotReviewVisible(apiKey, String(review.external_id))), method: "trustpilot_api" };
  }
  return null;
}

/**
 * Writes a ledger and the outcome recomputed from it back to the case. The
 * status is only changed when the caller asks for it. Once the platform has
 * rejected the report the routes are re-detected so the appeal route opens,
 * keeping the policy citation that was retrieved when the case was opened.
 */
export async function commitCaseLedger(
  client: any,
  workspaceId: string,
  caseId: string,
  evidence: any,
  ledger: unknown[],
  status?: string,
) {
  const { resealWithLedger } = await import("./evidence.server");

  // A case created before the evidence package existed has nothing to reseal.
  // The ledger is still recorded, and the outcome is still derived from it.
  let nextEvidence = evidence;
  let outcome: string;
  let outcomeAt: string | null;
  // Only a sealed package can be resealed; a legacy ledger-only record (written
  // by the branch below) would fail validation as an unknown schema.
  if (evidence && evidence.schema !== "seovale.evidence.legacy_ledger_only") {
    nextEvidence = resealWithLedger(evidence, ledger as never);
    const { hasPriorRejection } = await import("./lifecycle");
    const routes = Array.isArray(nextEvidence?.routes) ? nextEvidence.routes : [];
    if (nextEvidence?.schema === "seovale.evidence.v1" && hasPriorRejection(ledger as never, status) && !routes.some((r: any) => r?.route === "platform_appeal")) {
      const { detectRoutes, lookupFromRoutes } = await import("./routes");
      const { providerApiApproved } = await import("@/lib/removal-scan.server");
      const { resealWithRoutes } = await import("./evidence.server");
      const rerouted = detectRoutes({
        platform: nextEvidence.review.platform,
        violation: nextEvidence.finding.violationType,
        capability: { providerApiApproved: await providerApiApproved(client, workspaceId), legalSourceConnected: nextEvidence.legal?.status === "LEGAL_SOURCE_CONNECTED" },
        priorRejection: true,
        policyLookup: lookupFromRoutes(routes),
      });
      if (rerouted.length > 0) nextEvidence = resealWithRoutes(nextEvidence, rerouted);
    }
    outcome = nextEvidence.verification.outcome;
    outcomeAt = nextEvidence.verification.outcomeAt;
  } else {
    const resolved = resolveOutcome(ledger as never);
    outcome = resolved.outcome;
    outcomeAt = resolved.outcomeAt;
    nextEvidence = { schema: "seovale.evidence.legacy_ledger_only", verification: { ledger } };
  }

  const { error } = await client
    .from("removal_cases")
    .update({
      evidence: nextEvidence,
      outcome,
      outcome_at: outcomeAt,
      ...(status ? { status } : {}),
    })
    .eq("id", caseId)
    .eq("workspace_id", workspaceId);
  if (error) throw error;
  return { outcome, outcomeAt };
}

export type RecheckResult =
  | { performed: false; reason: string }
  | { performed: true; reviewVisible: boolean; basis: string; statusChangedTo: string | null; outcome: string; outcomeAt: string | null };

/**
 * Rechecks one case against the provider API and, only for a definite
 * observation, appends RECHECK (and AFTER when it settles the case).
 */
export async function recheckCase(
  client: any,
  admin: any,
  workspaceId: string,
  caseId: string,
  observe: typeof observeReviewVisibility = observeReviewVisibility,
): Promise<RecheckResult> {
  const { data: row, error } = await client
    .from("removal_cases")
    .select("id, status, route, evidence, outcome, review_id")
    .eq("id", caseId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("That removal case no longer exists.");
  const evidence = row.evidence && typeof row.evidence === "object" ? row.evidence : null;
  const ledger: Ledger = Array.isArray(evidence?.verification?.ledger) ? evidence.verification.ledger : [];

  const { data: review, error: reviewError } = await client
    .from("reviews")
    .select("platform, external_id")
    .eq("id", row.review_id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) return { performed: false, reason: "The review row no longer exists, so there is nothing to re-fetch." };

  let observed: Observation | null;
  try {
    observed = await observe(admin, workspaceId, review);
  } catch (caught) {
    return { performed: false, reason: caught instanceof Error ? caught.message : "The provider could not be reached." };
  }
  if (!observed) {
    return {
      performed: false,
      reason: `No working ${review.platform} connection can re-fetch this review. Record what you see on ${review.platform} as a user-reported observation.`,
    };
  }
  if (observed.visible === null) {
    return { performed: false, reason: `The automatic recheck could not observe the review: ${observed.detail}` };
  }

  const observedAt = new Date().toISOString();
  let next = appendEntry(ledger, {
    phase: "RECHECK",
    at: observedAt,
    actor: { kind: "system", id: null },
    observation: observed.visible ? "The provider API still returns the review." : "The provider API no longer returns the review.",
    source: { type: "provider_api_recheck", detail: `${observed.method}: ${observed.detail}` },
    reviewVisible: observed.visible,
  });
  const resolved = resolveOutcome(next);

  // A submitted case is closed by a definite provider observation, and an
  // "approved" case whose review is still published goes back to "rejected";
  // any other status is left as it is.
  let status: string | undefined;
  const target = statusAfterRecheck(row.status, resolved.outcome);
  if (target) {
    next = appendEntry(next, {
      phase: "AFTER",
      at: observedAt,
      actor: { kind: "system", id: null },
      observation: resolved.basis,
      source: { type: "derived_from_recheck", detail: `outcome=${resolved.outcome}` },
    });
    status = target;
  }

  const result = await commitCaseLedger(client, workspaceId, caseId, evidence, next, status);
  return { performed: true, reviewVisible: observed.visible, basis: resolved.basis, statusChangedTo: status ?? null, ...result };
}

export type DueRecheckSummary = {
  examined: number;
  due: number;
  performed: number;
  skipped: number;
  failed: number;
  results: Array<{ caseId: string; workspaceId: string; performed: boolean; reviewVisible?: boolean; reason?: string }>;
};

/** How many open cases are looked at per run to find the due ones. */
const CANDIDATE_WINDOW = 200;

/**
 * Rechecks the cases whose ledger says a recheck is due (lifecycle's
 * nextRecheckDue), oldest-updated first, making at most `limit` provider calls.
 * Cases with no working provider connection are skipped and nothing is written.
 */
export async function runDueRechecks(
  admin: any,
  limit = 20,
  options: { now?: Date; observe?: typeof observeReviewVisibility } = {},
): Promise<DueRecheckSummary> {
  const now = options.now ?? new Date();
  const summary: DueRecheckSummary = { examined: 0, due: 0, performed: 0, skipped: 0, failed: 0, results: [] };

  const { data: candidates, error } = await admin
    .from("removal_cases")
    .select("id, workspace_id, status, ledger:evidence->verification->ledger")
    .in("status", ["submitted", "approved", "rejected"])
    .order("updated_at", { ascending: true })
    .limit(CANDIDATE_WINDOW);
  if (error) throw error;

  let attempts = 0;
  for (const candidate of (candidates ?? []) as Array<{ id: string; workspace_id: string; ledger: unknown }>) {
    summary.examined += 1;
    const ledger = Array.isArray(candidate.ledger) ? (candidate.ledger as Ledger) : [];
    const due = nextRecheckDue(ledger);
    if (!due || Date.parse(due) > now.getTime()) continue;
    summary.due += 1;
    if (attempts >= limit) {
      summary.skipped += 1;
      continue;
    }
    // Counts provider calls only: a case with no connection costs nothing.
    let called = false;
    const observe: typeof observeReviewVisibility = async (...args) => {
      const observed = await (options.observe ?? observeReviewVisibility)(...args);
      if (observed) called = true;
      return observed;
    };
    try {
      const result = await recheckCase(admin, admin, candidate.workspace_id, candidate.id, observe);
      if (called) attempts += 1;
      if (result.performed) {
        summary.performed += 1;
        summary.results.push({ caseId: candidate.id, workspaceId: candidate.workspace_id, performed: true, reviewVisible: result.reviewVisible });
      } else {
        summary.skipped += 1;
        summary.results.push({ caseId: candidate.id, workspaceId: candidate.workspace_id, performed: false, reason: result.reason });
      }
    } catch (caught) {
      if (called) attempts += 1;
      summary.failed += 1;
      summary.results.push({ caseId: candidate.id, workspaceId: candidate.workspace_id, performed: false, reason: caught instanceof Error ? caught.message : String(caught) });
    }
  }
  return summary;
}
