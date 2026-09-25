/**
 * Removal-case lifecycle and the verification ledger.
 *
 * The ledger is an append-only record of what actually happened to a case, in
 * five phases:
 *
 *   BEFORE      the state of the review when the case was opened
 *   SUBMISSION  a report or appeal actually left the system, or was filed by a
 *               person through the provider interface
 *   RESPONSE    what the provider actually answered, verbatim
 *   RECHECK     a fresh observation of whether the review is still there
 *   AFTER       the state of the review once the case closed
 *
 * The rule this module exists to enforce: a review is never recorded as removed
 * because a report was generated, a submission was prepared, a request was sent
 * or a model predicted it. Only a RECHECK observation can establish removal,
 * and a RECHECK outranks whatever the provider claimed.
 */

export const PHASES = ["BEFORE", "SUBMISSION", "RESPONSE", "RECHECK", "AFTER"] as const;
export type Phase = (typeof PHASES)[number];

/** The five statuses the existing removals UI already renders. Unchanged. */
export const CASE_STATUSES = ["flagged", "submitted", "approved", "rejected", "dismissed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * Verified outcomes only. There is deliberately no value meaning "we think it
 * will be removed" or "the provider said they removed it" — those live in the
 * ledger as a provider claim, not as an outcome.
 */
export const OUTCOMES = ["unverified", "removed", "retained"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** What the provider actually decided, kept separate from the verified outcome. */
export const PROVIDER_DECISIONS = ["none", "accepted", "rejected", "no_response"] as const;
export type ProviderDecision = (typeof PROVIDER_DECISIONS)[number];

export type ProviderResponse = {
  /** How the answer arrived: the provider interface, email, an API response. */
  channel: string;
  /** The provider's answer as received. Never paraphrased, never generated. */
  verbatim: string;
  /** A provider case or reference number, only when the provider issued one. */
  reference: string | null;
  decision: ProviderDecision;
  receivedAt: string;
};

export type LedgerEntry = {
  phase: Phase;
  at: string;
  actor: { kind: "system" | "user" | "provider"; id: string | null };
  /** What was observed or done. A statement of fact, not an interpretation. */
  observation: string;
  /** Where this entry came from, so the ledger stays auditable. */
  source: { type: string; detail: string };
  /**
   * RECHECK only: whether the review was actually still visible at that moment.
   * null means the recheck could not be carried out — which is not evidence of
   * removal and is treated as such.
   */
  reviewVisible?: boolean | null;
  /** RESPONSE only. */
  providerResponse?: ProviderResponse;
};

export type Ledger = LedgerEntry[];

const ALLOWED: Record<CaseStatus, CaseStatus[]> = {
  flagged: ["submitted", "dismissed"],
  submitted: ["approved", "rejected", "dismissed"],
  approved: [],
  rejected: ["submitted", "dismissed"],
  dismissed: [],
};

/** Whether the case may move from one status to another. */
export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`A removal case cannot move from ${from} to ${to}.`);
  }
}

/**
 * The status a settled recheck moves the case to, or null to leave it alone.
 *
 * A submitted case closes on the observation. A case marked "approved" because
 * the platform said it accepted the report, but whose recheck still finds the
 * review published, goes to "rejected": the platform's claim was contradicted
 * by what was observed, and that is what reopens resubmission and the appeal
 * route. This is only reachable from a recheck, never from a status click, so
 * the manual state machine above is unchanged.
 */
export function statusAfterRecheck(status: string, outcome: Outcome): CaseStatus | null {
  if (status === "submitted" && outcome === "removed") return "approved";
  if (status === "submitted" && outcome === "retained") return "rejected";
  if (status === "approved" && outcome === "retained") return "rejected";
  return null;
}

/** Allowed clock skew for a caller-supplied observation time. */
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Refuses an observation dated in the future. The latest RECHECK decides the
 * outcome, so a future-dated entry would outrank every real recheck made after
 * it and pin the outcome regardless of what is later observed.
 */
export function assertNotFuture(at: string, now: Date = new Date()): void {
  const time = Date.parse(at);
  if (Number.isNaN(time)) throw new Error(`"${at}" is not a date.`);
  if (time - now.getTime() > MAX_FUTURE_SKEW_MS) {
    throw new Error("An observation cannot be dated in the future.");
  }
}

function latest(ledger: Ledger, phase: Phase): LedgerEntry | null {
  let found: LedgerEntry | null = null;
  for (const entry of ledger) {
    if (entry.phase !== phase) continue;
    if (!found || Date.parse(entry.at) >= Date.parse(found.at)) found = entry;
  }
  return found;
}

/**
 * The verified outcome, derived only from recheck evidence.
 *
 * A provider claiming removal is not enough: if the recheck still sees the
 * review, the outcome is `retained`. Equally, a provider rejection does not
 * force `retained` — if a later recheck finds the review gone, it is gone.
 */
export function resolveOutcome(ledger: Ledger): {
  outcome: Outcome;
  outcomeAt: string | null;
  basis: string;
} {
  const recheck = latest(ledger, "RECHECK");

  if (recheck && recheck.reviewVisible === false) {
    return {
      outcome: "removed",
      outcomeAt: recheck.at,
      basis: `Recheck on ${recheck.at} found the review absent. Source: ${recheck.source.type}.`,
    };
  }
  if (recheck && recheck.reviewVisible === true) {
    return {
      outcome: "retained",
      outcomeAt: recheck.at,
      basis: `Recheck on ${recheck.at} found the review still published. Source: ${recheck.source.type}.`,
    };
  }
  if (recheck) {
    return {
      outcome: "unverified",
      outcomeAt: null,
      basis: "A recheck was attempted but could not observe the review, so nothing is established.",
    };
  }

  const response = latest(ledger, "RESPONSE");
  if (response?.providerResponse) {
    return {
      outcome: "unverified",
      outcomeAt: null,
      basis: `The provider answered (${response.providerResponse.decision}), but no recheck has confirmed what happened to the review.`,
    };
  }

  const submission = latest(ledger, "SUBMISSION");
  if (submission) {
    return {
      outcome: "unverified",
      outcomeAt: null,
      basis:
        "A submission is recorded. No provider response and no recheck yet, so nothing is established.",
    };
  }

  return {
    outcome: "unverified",
    outcomeAt: null,
    basis: "No submission, response or recheck is recorded yet.",
  };
}

/** The provider's own decision, reported separately from the verified outcome. */
export function providerDecision(ledger: Ledger): ProviderDecision {
  return latest(ledger, "RESPONSE")?.providerResponse?.decision ?? "none";
}

/**
 * Guards a write of the outcome column. Refuses to record removal unless the
 * ledger actually contains a recheck that saw the review gone, whatever the
 * caller asked for.
 */
export function assertOutcomeSupported(ledger: Ledger, outcome: Outcome): void {
  if (outcome === "unverified") return;
  const resolved = resolveOutcome(ledger);
  if (resolved.outcome !== outcome) {
    throw new Error(
      `Outcome "${outcome}" is not supported by the case evidence. The ledger supports "${resolved.outcome}": ${resolved.basis}`,
    );
  }
}

/** Appends an entry, keeping the ledger ordered oldest first. */
export function appendEntry(ledger: Ledger, entry: LedgerEntry): Ledger {
  return [...ledger, entry].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** Which phases have been recorded, for progress display without guessing. */
export function phaseProgress(ledger: Ledger): Record<Phase, boolean> {
  return {
    BEFORE: ledger.some((e) => e.phase === "BEFORE"),
    SUBMISSION: ledger.some((e) => e.phase === "SUBMISSION"),
    RESPONSE: ledger.some((e) => e.phase === "RESPONSE"),
    RECHECK: ledger.some((e) => e.phase === "RECHECK"),
    AFTER: ledger.some((e) => e.phase === "AFTER"),
  };
}

/**
 * When the case should next be rechecked. Providers give no completion signal,
 * so a report that got no answer still has to be looked at again.
 */
export function nextRecheckDue(ledger: Ledger, intervalHours = 72): string | null {
  const anchor =
    latest(ledger, "RECHECK") ?? latest(ledger, "RESPONSE") ?? latest(ledger, "SUBMISSION");
  if (!anchor) return null;
  const resolved = resolveOutcome(ledger);
  if (resolved.outcome === "removed") return null;
  return new Date(Date.parse(anchor.at) + intervalHours * 3_600_000).toISOString();
}

/**
 * True once the platform has actually decided against this case: the case was
 * set to "rejected", or the ledger holds a provider RESPONSE with a rejected
 * decision. This is what opens the platform's appeal route.
 */
export function hasPriorRejection(ledger: Ledger, status?: string | null): boolean {
  if (status === "rejected") return true;
  return ledger.some((e) => e.phase === "RESPONSE" && e.providerResponse?.decision === "rejected");
}

/** How close in time two identical ledger entries must be to count as one retried request. */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;

function submissionKey(entry: LedgerEntry): string | null {
  if (entry.phase !== "SUBMISSION") return null;
  const detail = entry.source?.detail ?? "";
  const route = /(?:^|; )route=([^;]*)/.exec(detail)?.[1] ?? "";
  const reference = /; provider reference=(.*)$/.exec(detail)?.[1] ?? "";
  return `${route}|${reference}`;
}

function responseKey(entry: LedgerEntry): string | null {
  const r = entry.phase === "RESPONSE" ? entry.providerResponse : undefined;
  if (!r) return null;
  return JSON.stringify([r.decision, r.verbatim, r.reference ?? null]);
}

/**
 * The entry already in the ledger that `candidate` would duplicate: same phase,
 * same route and provider reference (SUBMISSION) or the same decision, answer
 * and reference (RESPONSE), recorded within DUPLICATE_WINDOW_MS of it. A retried
 * request returns that entry instead of appending a second one.
 */
export function findRecentDuplicate(
  ledger: Ledger,
  candidate: LedgerEntry,
  windowMs = DUPLICATE_WINDOW_MS,
): LedgerEntry | null {
  const key = candidate.phase === "SUBMISSION" ? submissionKey(candidate) : responseKey(candidate);
  if (key === null) return null;
  const at = Date.parse(candidate.at);
  for (const entry of ledger) {
    if (entry.phase !== candidate.phase) continue;
    const other = entry.phase === "SUBMISSION" ? submissionKey(entry) : responseKey(entry);
    if (other !== key || Math.abs(Date.parse(entry.at) - at) > windowMs) continue;
    // A genuine resubmission after the platform answered (or after a recheck)
    // is new even inside the window: only a bare retry is folded.
    const since = Date.parse(entry.at);
    const intervened = ledger.some(
      (e) => e !== entry && e.phase !== candidate.phase && e.phase !== "BEFORE" && e.phase !== "AFTER" && Date.parse(e.at) > since,
    );
    if (!intervened) return entry;
  }
  return null;
}

/** The lifecycle labels the removals screen shows, derived and never stored. */
export const CASE_STAGES = [
  "IDENTIFIED",
  "HUMAN_REVIEW",
  "READY_TO_SUBMIT",
  "SUBMITTED",
  "PLATFORM_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "APPEAL_AVAILABLE",
  "RECHECK_REQUIRED",
  "REMOVED",
  "NOT_REMOVED",
  "CLOSED",
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

function routeOf(entry: LedgerEntry | null): string | null {
  return entry ? (/(?:^|; )route=([^;]*)/.exec(entry.source?.detail ?? "")?.[1] ?? null) : null;
}

/**
 * The stage of a case, from its status, stored outcome and ledger. Pure.
 *
 *  - REMOVED only when the stored outcome is "removed" AND the ledger itself
 *    resolves to removed, i.e. a recheck observed the review gone.
 *  - A settled "retained" is APPEAL_AVAILABLE while the platform's appeal has
 *    not been used, otherwise NOT_REMOVED.
 *  - A recheck that is due outranks the provider's answer, which is only a claim.
 *  - A flagged case is IDENTIFIED when it predates the evidence package,
 *    READY_TO_SUBMIT when its primary route has a retrieved policy citation, and
 *    HUMAN_REVIEW otherwise (nothing retrieved backs the AI's candidate yet).
 */
export function deriveCaseStage(input: {
  status: string;
  outcome: string | null;
  ledger: Ledger;
  policyCited?: boolean;
  now?: Date;
}): CaseStage {
  const { status, ledger } = input;
  const now = (input.now ?? new Date()).getTime();
  if (status === "dismissed") return "CLOSED";

  const resolved = resolveOutcome(ledger);
  if (resolved.outcome === "removed" && input.outcome === "removed") return "REMOVED";

  const appealFiled = ledger.some((e) => e.phase === "SUBMISSION" && routeOf(e) === "platform_appeal");
  if (resolved.outcome === "retained") {
    return status === "rejected" && !appealFiled ? "APPEAL_AVAILABLE" : "NOT_REMOVED";
  }

  const due = nextRecheckDue(ledger);
  if (due && Date.parse(due) <= now) return "RECHECK_REQUIRED";

  const submission = latest(ledger, "SUBMISSION");
  const response = latest(ledger, "RESPONSE");
  if (response?.providerResponse && (!submission || Date.parse(response.at) >= Date.parse(submission.at))) {
    const decision = response.providerResponse.decision;
    if (decision === "accepted") return "ACCEPTED";
    if (decision === "rejected") return appealFiled ? "REJECTED" : "APPEAL_AVAILABLE";
    return "PLATFORM_REVIEW";
  }
  if (submission) {
    return /; provider reference=/.test(submission.source?.detail ?? "") ? "PLATFORM_REVIEW" : "SUBMITTED";
  }
  if (status === "rejected") return "APPEAL_AVAILABLE";
  if (status === "approved") return "ACCEPTED";
  if (status === "submitted") return "SUBMITTED";
  if (!ledger.some((e) => e.phase === "BEFORE")) return "IDENTIFIED";
  return input.policyCited ? "READY_TO_SUBMIT" : "HUMAN_REVIEW";
}
