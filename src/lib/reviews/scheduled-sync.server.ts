/**
 * Hourly review sync, run by the job runner (/api/public/integrations/jobs-run)
 * right after it has reconciled every Google connection with Google's live
 * answer.
 *
 * - Google: only workspaces whose connection state is CONNECTED — Google has
 *   returned authorized Business Profile data and no call has failed since. The
 *   scheduler never marks anything connected itself.
 * - Trustpilot: only workspaces with a verified (connected) business unit and
 *   an API key.
 * - Every provider/workspace pair runs in its own try/catch, so one failure
 *   never stops the others.
 * - Single-flight per workspace+platform: a sync_runs row still 'running' and
 *   younger than 30 minutes means a sync is in progress, so this one is
 *   skipped. An older 'running' row is a sync that died; it is closed as
 *   'failed' with a clear message and a fresh sync starts.
 *
 * `admin` is the service-role client (no RLS), so every query is filtered by
 * workspace_id explicitly.
 */
import { googleBusinessState } from "../google-business-sync.server";

export const SYNC_RUN_STALE_MS = 30 * 60_000;
export const STALE_SYNC_MESSAGE = "This sync did not finish within 30 minutes and was marked failed by the scheduler so a new sync could start.";

type SyncCounts = { reviewsFound: number; reviewsCreated: number; notices?: string[] };

export type ScheduledSyncOutcome = {
  workspaceId: string;
  status: "synced" | "skipped" | "failed";
  detail: string;
  reviewsFound?: number;
  reviewsCreated?: number;
  staleRunsClosed?: number;
};

export type ScheduledSyncDeps = {
  runGoogle: (workspaceId: string) => Promise<SyncCounts>;
  runTrustpilot: (workspaceId: string) => Promise<SyncCounts>;
  hasTrustpilotKey: (workspaceId: string) => Promise<boolean>;
  now: () => number;
};

export type ScheduledSyncSummary = {
  google: ScheduledSyncOutcome[] | { error: string };
  trustpilot: ScheduledSyncOutcome[] | { error: string };
};

function defaultDeps(admin: any): ScheduledSyncDeps {
  return {
    runGoogle: async (workspaceId) => {
      const { runGoogleReviewSync } = await import("../google-business-sync.server");
      return runGoogleReviewSync(admin, admin, workspaceId, "scheduled");
    },
    runTrustpilot: async (workspaceId) => {
      const { runTrustpilotSync } = await import("./trustpilot-sync.server");
      return runTrustpilotSync(admin, admin, workspaceId, "scheduled");
    },
    hasTrustpilotKey: async (workspaceId) => {
      const { trustpilotApiKey } = await import("./trustpilot-sync.server");
      return Boolean(await trustpilotApiKey(admin, workspaceId));
    },
    now: () => Date.now(),
  };
}

const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : String(caught)).slice(0, 500);

/**
 * Closes stale 'running' rows for this workspace+platform and reports whether
 * a live one remains. Only rows of this workspace are read or changed.
 */
export async function checkSyncSlot(admin: any, workspaceId: string, platform: string, now: number) {
  const { data, error } = await admin.from("sync_runs").select("id,started_at").eq("workspace_id", workspaceId).eq("platform", platform).eq("status", "running");
  if (error) throw error;
  let busy = false;
  let staleClosed = 0;
  for (const row of (data ?? []) as Array<{ id: string; started_at: string }>) {
    const started = Date.parse(row.started_at);
    if (Number.isFinite(started) && now - started < SYNC_RUN_STALE_MS) {
      busy = true;
      continue;
    }
    const { error: closeError } = await admin
      .from("sync_runs")
      .update({ status: "failed", error_message: STALE_SYNC_MESSAGE, completed_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .eq("workspace_id", workspaceId)
      .eq("status", "running");
    if (closeError) throw closeError;
    staleClosed += 1;
  }
  return { busy, staleClosed };
}

async function runOne(admin: any, workspaceId: string, platform: string, run: () => Promise<SyncCounts>, now: number): Promise<ScheduledSyncOutcome> {
  try {
    const slot = await checkSyncSlot(admin, workspaceId, platform, now);
    if (slot.busy) return { workspaceId, status: "skipped", detail: "A sync for this workspace is already running.", staleRunsClosed: slot.staleClosed };
    const result = await run();
    return {
      workspaceId,
      status: "synced",
      detail: result.notices?.length ? result.notices.join(" ") : "Sync completed.",
      reviewsFound: result.reviewsFound,
      reviewsCreated: result.reviewsCreated,
      staleRunsClosed: slot.staleClosed,
    };
  } catch (caught) {
    // The provider sync already recorded the failure on its sync_runs row and
    // connection; here it only must not stop the next workspace.
    return { workspaceId, status: "failed", detail: errorText(caught) };
  }
}

export async function runScheduledReviewSyncs(admin: any, overrides: Partial<ScheduledSyncDeps> = {}): Promise<ScheduledSyncSummary> {
  const deps = { ...defaultDeps(admin), ...overrides };
  const summary: ScheduledSyncSummary = { google: [], trustpilot: [] };

  try {
    const { data: rows, error } = await admin.from("google_business_connections").select("workspace_id,status,scopes,last_error").neq("status", "revoked");
    if (error) throw error;
    const outcomes: ScheduledSyncOutcome[] = [];
    for (const row of (rows ?? []) as Array<{ workspace_id: string; status: string; scopes: unknown; last_error: string | null }>) {
      // Only a connection Google has proven usable is synced; anything else is
      // reported with its truthful state and left for the owner or the next check.
      const state = googleBusinessState(row);
      if (state.code !== "CONNECTED") {
        outcomes.push({ workspaceId: row.workspace_id, status: "skipped", detail: state.code });
        continue;
      }
      outcomes.push(await runOne(admin, row.workspace_id, "google", () => deps.runGoogle(row.workspace_id), deps.now()));
    }
    summary.google = outcomes;
  } catch (caught) {
    summary.google = { error: errorText(caught) };
  }

  try {
    const { data: rows, error } = await admin.from("integration_connections").select("workspace_id,account_ref,status").eq("provider", "trustpilot").eq("status", "connected");
    if (error) throw error;
    const outcomes: ScheduledSyncOutcome[] = [];
    for (const row of (rows ?? []) as Array<{ workspace_id: string; account_ref: string | null; status: string }>) {
      if (!row.account_ref) {
        outcomes.push({ workspaceId: row.workspace_id, status: "skipped", detail: "No Trustpilot business unit is set." });
        continue;
      }
      let hasKey = false;
      try {
        hasKey = await deps.hasTrustpilotKey(row.workspace_id);
      } catch (caught) {
        outcomes.push({ workspaceId: row.workspace_id, status: "failed", detail: errorText(caught) });
        continue;
      }
      if (!hasKey) {
        outcomes.push({ workspaceId: row.workspace_id, status: "skipped", detail: "No Trustpilot API key is configured." });
        continue;
      }
      outcomes.push(await runOne(admin, row.workspace_id, "trustpilot", () => deps.runTrustpilot(row.workspace_id), deps.now()));
    }
    summary.trustpilot = outcomes;
  } catch (caught) {
    summary.trustpilot = { error: errorText(caught) };
  }

  return summary;
}

/** The cron response carries outcomes and counts only — no workspace ids. */
export function publicSyncSummary(summary: ScheduledSyncSummary) {
  const strip = (value: ScheduledSyncOutcome[] | { error: string }) =>
    Array.isArray(value) ? value.map(({ workspaceId: _workspaceId, ...rest }) => rest) : value;
  return { google: strip(summary.google), trustpilot: strip(summary.trustpilot) };
}
