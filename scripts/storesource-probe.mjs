// Diagnostic: reproduce exactly what the engine's storeSource() does for the
// `http` source, but check the error the engine currently discards.
import { collectPage, normalizeTarget } from "../src/lib/scan/collectors.server";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

const scanId = process.argv[2];
const url = process.argv[3];
const t = normalizeTarget(url);
const result = await collectPage(t.url);
console.log("collector:", result.source, result.status, "html bytes:", String(result.raw?.html ?? "").length);

const { data: scan } = await supabaseAdmin.from("scans").select("workspace_id").eq("id", scanId).single();

const { error, status, statusText } = await supabaseAdmin.from("scan_sources").upsert(
  {
    scan_id: scanId,
    workspace_id: scan.workspace_id,
    source: result.source,
    provider: result.provider ?? null,
    status: result.status,
    http_status: result.httpStatus ?? null,
    duration_ms: result.durationMs,
    error_message: result.errorMessage ?? null,
    raw: result.raw,
    created_at: new Date().toISOString(),
  },
  { onConflict: "scan_id,source" },
);

console.log("\nupsert http_status:", status, statusText);
if (error) {
  console.log("UPSERT ERROR (this is what the engine currently discards):");
  console.log("  code   :", error.code);
  console.log("  message:", error.message);
  console.log("  details:", error.details);
  console.log("  hint   :", error.hint);
} else {
  console.log("upsert succeeded — row stored");
}
