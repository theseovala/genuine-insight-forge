// Client-facing scan API. Everything returned here comes from stored scan data
// produced by real network calls — no value is generated for display purposes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function workspace(context: Ctx) {
  const { data, error } = await context.supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", context.userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No workspace is assigned to this account.");
  return data as { workspace_id: string; role: string };
}

export const createScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().min(3).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context as Ctx);
    const { normalizeTarget } = await import("@/lib/scan/collectors.server");
    const target = normalizeTarget(data.url);
    const { data: row, error } = await (context as Ctx).supabase
      .from("scans")
      .insert({
        workspace_id: member.workspace_id,
        requested_by: (context as Ctx).userId,
        target_url: target.url,
        target_domain: target.domain,
        status: "queued",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, url: target.url, domain: target.domain };
  });

/** Runs a queued scan. Long-running, so the UI starts it and then polls. */
export const runScanNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: scan, error } = await (context as Ctx).supabase.from("scans").select("id,status").eq("id", data.id).single();
    if (error) throw error;
    if (!scan) throw new Error("Scan not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runScan } = await import("@/lib/scan/engine.server");
    try {
      return await runScan(supabaseAdmin, data.id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      await supabaseAdmin.from("scans").update({ status: "failed", error_message: message.slice(0, 500), completed_at: new Date().toISOString() }).eq("id", data.id);
      throw caught;
    }
  });

export const cancelScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context as Ctx).supabase
      .from("scans")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["queued", "running"]);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Data lifecycle: removes one scan and everything derived from it. Related
 * layers are deleted explicitly so nothing unrelated is touched.
 */
export const deleteScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = (context as Ctx).supabase;
    // RLS check first: the caller must be able to see this scan.
    const { data: scan, error } = await supabase.from("scans").select("id,workspace_id").eq("id", data.id).single();
    if (error) throw error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const table of ["scan_findings", "scan_metrics", "scan_sources", "scan_reports", "provider_raw_data"]) {
      await supabaseAdmin.from(table).delete().eq("scan_id", scan.id);
    }
    await supabaseAdmin.from("scans").delete().eq("id", scan.id);
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: scan.workspace_id,
      action: "scan.deleted",
      target_type: "scan",
      target_id: scan.id,
      metadata: { requested_by: (context as Ctx).userId },
    });
    return { ok: true };
  });

export const listScans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as Ctx).supabase
      .from("scans")
      .select("id,target_url,target_domain,status,score,duration_ms,error_message,created_at,completed_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const getScan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = (context as Ctx).supabase;
    const { data: scan, error } = await supabase
      .from("scans")
      .select("id,target_url,target_domain,status,score,duration_ms,error_message,created_at,started_at,completed_at")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [sources, metrics, findings, report] = await Promise.all([
      supabase.from("scan_sources").select("source,provider,status,http_status,duration_ms,error_message,created_at").eq("scan_id", data.id).order("source"),
      supabase.from("scan_metrics").select("category,metric_key,value_numeric,value_text,unit,source").eq("scan_id", data.id).order("category"),
      supabase.from("scan_findings").select("category,code,severity,title,detail,recommendation,impact,evidence,source,created_at").eq("scan_id", data.id),
      supabase.from("scan_reports").select("score,category_scores,summary,model,created_at").eq("scan_id", data.id).maybeSingle(),
    ]);

    const { freshnessOf } = await import("@/lib/scan/engine.server");
    const sourceRows = (sources.data ?? []).map((row: any) => ({ ...row, freshness: freshnessOf(row.source, row.created_at) }));

    // Historical comparison against the previous completed scan of the same domain.
    const { data: previous } = await supabase
      .from("scans")
      .select("id,score,created_at")
      .eq("target_domain", scan.target_domain)
      .eq("status", "completed")
      .lt("created_at", scan.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let comparison: null | {
      previousScanId: string;
      previousScore: number | null;
      previousAt: string;
      resolved: { code: string; title: string }[];
      introduced: { code: string; title: string }[];
      unchanged: number;
    } = null;
    if (previous) {
      const { data: previousFindings } = await supabase.from("scan_findings").select("code,title").eq("scan_id", previous.id);
      const before = new Map<string, string>((previousFindings ?? []).map((f: any) => [String(f.code), String(f.title)]));
      const now = new Map<string, string>((findings.data ?? []).map((f: any) => [String(f.code), String(f.title)]));
      comparison = {
        previousScanId: previous.id,
        previousScore: previous.score,
        previousAt: previous.created_at,
        resolved: Array.from(before.entries()).filter(([code]) => !now.has(code)).map(([code, title]) => ({ code, title })),
        introduced: Array.from(now.entries()).filter(([code]) => !before.has(code)).map(([code, title]) => ({ code, title })),
        unchanged: Array.from(now.keys()).filter((code) => before.has(code)).length,
      };
    }

    return {
      scan,
      sources: sourceRows,
      metrics: metrics.data ?? [],
      findings: findings.data ?? [],
      report: report.data ?? null,
      comparison,
    };
  });

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined || value === "" ? "DATA NOT AVAILABLE" : String(value);
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
};

/** CSV built strictly from stored scan rows. */
export const exportScanCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = (context as Ctx).supabase;
    const { data: scan, error } = await supabase.from("scans").select("target_url,target_domain,status,score,created_at,completed_at").eq("id", data.id).single();
    if (error) throw error;
    const [findings, metrics, sources] = await Promise.all([
      supabase.from("scan_findings").select("category,code,severity,title,detail,recommendation,impact,evidence,source,created_at").eq("scan_id", data.id),
      supabase.from("scan_metrics").select("category,metric_key,value_numeric,value_text,unit,source").eq("scan_id", data.id),
      supabase.from("scan_sources").select("source,provider,status,http_status,duration_ms,error_message,created_at").eq("scan_id", data.id),
    ]);

    const lines: string[] = [];
    lines.push(["Section", "Category", "Key", "Severity", "Value", "Detail", "Recommendation", "Source", "Retrieved at"].map(csvCell).join(","));
    lines.push(["Scan", "target", "url", "", scan.target_url, `Status: ${scan.status}`, "", "scan", scan.created_at].map(csvCell).join(","));
    lines.push(["Scan", "target", "score", "", scan.score ?? "", "0-100, derived from measured findings", "", "scan", scan.completed_at ?? ""].map(csvCell).join(","));
    for (const source of sources.data ?? []) {
      lines.push(
        ["Source", "health", source.source, "", source.status, source.error_message ?? `HTTP ${source.http_status ?? ""} in ${source.duration_ms ?? ""}ms`, "", source.provider ?? "website", source.created_at]
          .map(csvCell)
          .join(","),
      );
    }
    for (const metric of metrics.data ?? []) {
      lines.push(
        ["Measurement", metric.category, metric.metric_key, "", metric.value_numeric ?? metric.value_text, metric.unit ?? "", "", metric.source, scan.completed_at ?? ""].map(csvCell).join(","),
      );
    }
    for (const finding of findings.data ?? []) {
      lines.push(
        [
          "Finding",
          finding.category,
          finding.code,
          finding.severity,
          finding.title,
          finding.detail,
          finding.recommendation ?? "",
          finding.source,
          (finding.evidence as any)?.collectedAt ?? finding.created_at,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return { filename: `seovale-scan-${scan.target_domain}-${new Date(scan.created_at).toISOString().slice(0, 10)}.csv`, csv: lines.join("\n") };
  });
