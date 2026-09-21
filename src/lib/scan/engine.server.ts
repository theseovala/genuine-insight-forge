// Scan orchestrator. Collects real data in parallel, stores the raw provider
// payload, normalizes it, analyses it, runs the existing AI stack over the
// verified findings only, and writes the report layer.
//
// Layers stay separated: scan_sources (RAW) → scan_metrics (NORMALIZED) →
// scan_findings (ANALYSIS) → scan_reports (REPORT). Nothing is invented: a
// source that fails or is not configured is recorded as such.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectCrawlDirectives,
  collectDns,
  collectPage,
  collectPageSpeed,
  collectRdap,
  collectTls,
  normalizeTarget,
  type SourceResult,
} from "./collectors.server";
import { analyze } from "./analyze.server";

/** How long a collected source stays valid for incremental re-use, per source. */
export const FRESHNESS_MINUTES: Record<string, number> = {
  http: 60,
  tls: 720,
  dns: 360,
  rdap: 1440,
  crawl_directives: 720,
  pagespeed: 720,
};

export function freshnessOf(source: string, collectedAt: string | null) {
  if (!collectedAt) return "unavailable" as const;
  const ttl = (FRESHNESS_MINUTES[source] ?? 720) * 60_000;
  const age = Date.now() - new Date(collectedAt).getTime();
  if (age <= ttl) return "fresh" as const;
  if (age <= ttl * 3) return "stale" as const;
  return "expired" as const;
}

async function audit(admin: SupabaseClient, workspaceId: string, action: string, scanId: string, metadata: Record<string, unknown> = {}) {
  await admin.from("audit_logs").insert({ workspace_id: workspaceId, action, target_type: "scan", target_id: scanId, metadata });
}

/** Google API key for PageSpeed: credential vault first, server environment as fallback. */
async function pagespeedKey(admin: SupabaseClient, workspaceId: string) {
  try {
    const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");
    const bag = await loadProviderCredentials(admin, workspaceId, "google_maps");
    const fromVault = bag["GOOGLE_MAPS_API_KEY"] ?? bag["GOOGLE_API_KEY"];
    if (fromVault) return fromVault;
  } catch {
    // Vault unavailable — fall through to the environment.
  }
  return process.env["GOOGLE_API_KEY"] ?? null;
}

export interface RunScanResult {
  status: "completed" | "failed";
  score: number | null;
  findings: number;
  sources: { source: string; status: string; reused: boolean }[];
}

export async function runScan(admin: SupabaseClient, scanId: string): Promise<RunScanResult> {
  const { data: scan, error } = await admin
    .from("scans")
    .select("id,workspace_id,target_url,target_domain,status,attempts,max_attempts")
    .eq("id", scanId)
    .single();
  if (error) throw error;
  if (!scan) throw new Error("Scan not found.");
  if (scan.status === "completed" || scan.status === "cancelled") {
    return { status: "completed", score: null, findings: 0, sources: [] };
  }

  const started = Date.now();
  await admin
    .from("scans")
    .update({ status: "running", started_at: new Date().toISOString(), attempts: (scan.attempts ?? 0) + 1, error_message: null })
    .eq("id", scanId);
  await audit(admin, scan.workspace_id, "scan.started", scanId, { url: scan.target_url });

  const target = normalizeTarget(scan.target_url);
  const key = await pagespeedKey(admin, scan.workspace_id);

  // Resume/incremental: sources already completed for this scan are not repeated.
  const { data: existing } = await admin.from("scan_sources").select("source,status,created_at").eq("scan_id", scanId);
  const done = new Map((existing ?? []).map((row: any) => [row.source, row]));
  const reusable = (source: string) => {
    const row = done.get(source);
    return Boolean(row && row.status === "completed" && freshnessOf(source, row.created_at) === "fresh");
  };

  const planned: { source: string; run: () => Promise<SourceResult> }[] = [
    { source: "http", run: () => collectPage(target.url) },
    { source: "tls", run: () => collectTls(target.origin) },
    { source: "dns", run: () => collectDns(target.domain) },
    { source: "rdap", run: () => collectRdap(target.domain) },
    { source: "crawl_directives", run: () => collectCrawlDirectives(target.origin) },
    { source: "pagespeed", run: () => collectPageSpeed(target.url, key) },
  ];

  const reused = planned.filter((item) => reusable(item.source)).map((item) => item.source);
  const toRun = planned.filter((item) => !reusable(item.source));

  // Independent sources run in parallel; one failing source never stops the scan.
  const collected = await Promise.all(
    toRun.map(async (item) => {
      try {
        return await item.run();
      } catch (caught) {
        return {
          source: item.source,
          provider: null,
          status: "failed" as const,
          durationMs: 0,
          errorMessage: caught instanceof Error ? caught.message : String(caught),
          raw: {},
        };
      }
    }),
  );

  for (const result of collected) {
    await admin.from("scan_sources").upsert(
      {
        scan_id: scanId,
        workspace_id: scan.workspace_id,
        source: result.source,
        provider: result.provider ?? null,
        status: result.status,
        http_status: result.httpStatus ?? null,
        duration_ms: result.durationMs,
        error_message: result.errorMessage ?? null,
        raw: result.raw as any,
        created_at: new Date().toISOString(),
      },
      { onConflict: "scan_id,source" },
    );
    if (result.provider) {
      await admin.from("provider_raw_data").insert({
        workspace_id: scan.workspace_id,
        provider: result.provider,
        resource_type: result.source,
        external_id: target.domain,
        scan_id: scanId,
        payload: result.raw as any,
      });
    }
    await admin.from("integration_api_logs").insert({
      workspace_id: scan.workspace_id,
      provider: result.provider ?? "website",
      operation: `scan.${result.source}`,
      method: "GET",
      endpoint: target.domain,
      http_status: result.httpStatus ?? null,
      duration_ms: result.durationMs,
      outcome_code: result.status === "completed" ? "CONNECTED" : result.status === "not_configured" ? "NOT_CONFIGURED" : "PROVIDER_ERROR",
      error_message: result.errorMessage ?? null,
    });
  }

  // Analysis runs over everything stored for this scan, reused rows included.
  const { data: allSources } = await admin
    .from("scan_sources")
    .select("source,provider,status,http_status,duration_ms,error_message,raw,created_at")
    .eq("scan_id", scanId);
  const sourceResults: SourceResult[] = (allSources ?? []).map((row: any) => ({
    source: row.source,
    provider: row.provider,
    status: row.status,
    httpStatus: row.http_status,
    durationMs: row.duration_ms ?? 0,
    errorMessage: row.error_message,
    raw: row.raw ?? {},
  }));

  const pageFailed = sourceResults.find((s) => s.source === "http")?.status !== "completed";
  const { metrics, findings, score, categoryScores } = analyze(sourceResults);

  if (metrics.length) {
    await admin.from("scan_metrics").upsert(
      metrics.map((metric) => ({
        scan_id: scanId,
        workspace_id: scan.workspace_id,
        category: metric.category,
        metric_key: metric.metricKey,
        value_numeric: metric.valueNumeric ?? null,
        value_text: metric.valueText ?? null,
        unit: metric.unit ?? null,
        source: metric.source,
      })),
      { onConflict: "scan_id,category,metric_key" },
    );
  }
  if (findings.length) {
    await admin.from("scan_findings").upsert(
      findings.map((finding) => ({
        scan_id: scanId,
        workspace_id: scan.workspace_id,
        category: finding.category,
        code: finding.code,
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        recommendation: finding.recommendation ?? null,
        impact: finding.impact,
        evidence: { ...(finding.evidence ?? {}), source: finding.source, collectedAt: new Date().toISOString(), confidence: "high", verification: "measured" },
        source: finding.source,
      })),
      { onConflict: "scan_id,code" },
    );
  }

  // ---------- AI analysis over verified findings only ----------
  let summary: string | null = null;
  let model: string | null = null;
  const aiStarted = Date.now();
  try {
    const { runAiText } = await import("@/lib/ai-gateway.server");
    const evidence = {
      url: target.url,
      score,
      sources: sourceResults.map((s) => ({ source: s.source, status: s.status, error: s.errorMessage ?? null })),
      measurements: metrics.map((m) => ({ category: m.category, key: m.metricKey, value: m.valueNumeric ?? m.valueText, unit: m.unit ?? null })),
      findings: findings.map((f) => ({ code: f.code, severity: f.severity, title: f.title, detail: f.detail, impact: f.impact })),
    };
    const result = await runAiText(
      "You are a technical SEO and web reputation analyst. Use ONLY the supplied measurements and findings. " +
        "Never invent data, numbers, rankings or provider results. If something was not measured, write 'Data unavailable'. " +
        "Reply in plain text with: a two-sentence executive summary, then 'Priority actions:' followed by at most five numbered actions, " +
        "each naming the business impact and the finding code it is based on.",
      JSON.stringify(evidence),
    );
    summary = result.output;
    model = result.model;
    await admin.from("ai_runs").insert({
      workspace_id: scan.workspace_id,
      user_id: (await admin.from("scans").select("requested_by").eq("id", scanId).maybeSingle()).data?.requested_by,
      purpose: "scan_analysis",
      model: result.model,
      input_hash: scanId,
      output: result.output.slice(0, 4000),
      duration_ms: Date.now() - aiStarted,
      status: "success",
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await admin.from("scan_sources").upsert(
      {
        scan_id: scanId,
        workspace_id: scan.workspace_id,
        source: "ai_analysis",
        provider: "lovable_ai",
        status: "failed",
        duration_ms: Date.now() - aiStarted,
        error_message: message.slice(0, 500),
        raw: {},
        created_at: new Date().toISOString(),
      },
      { onConflict: "scan_id,source" },
    );
  }

  await admin.from("scan_reports").upsert(
    {
      scan_id: scanId,
      workspace_id: scan.workspace_id,
      score,
      category_scores: categoryScores,
      summary,
      model,
    },
    { onConflict: "scan_id" },
  );

  const failedEverything = sourceResults.every((s) => s.status !== "completed");
  const status = failedEverything ? "failed" : "completed";
  await admin
    .from("scans")
    .update({
      status,
      score,
      duration_ms: Date.now() - started,
      completed_at: new Date().toISOString(),
      error_message: failedEverything ? "No data source could be reached for this address." : pageFailed ? "The website itself could not be loaded; other checks completed." : null,
    })
    .eq("id", scanId);

  await audit(admin, scan.workspace_id, `scan.${status}`, scanId, { score, findings: findings.length, reused });

  return {
    status,
    score,
    findings: findings.length,
    sources: sourceResults.map((s) => ({ source: s.source, status: s.status, reused: reused.includes(s.source) })),
  };
}
