/**
 * Phase 4 §9 — one real end-to-end scan against the live database.
 *
 * This runs the project's OWN scan engine (src/lib/scan/engine.server.ts) with
 * the real service-role client. Every collector makes a real network request.
 * Nothing here substitutes, seeds or simulates data.
 *
 * Usage: bun scripts/run-scan-test.mjs <https url>
 */
import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { runScan } from "../src/lib/scan/engine.server";
import { normalizeTarget } from "../src/lib/scan/collectors.server";

const url = process.argv[2];
if (!url) {
  console.error("usage: bun scripts/run-scan-test.mjs <https url>");
  process.exit(1);
}

const target = normalizeTarget(url);
console.log("target url   :", target.url);
console.log("target domain:", target.domain);

const wsQuery = supabaseAdmin.from("workspaces").select("id,name");
const { data: ws, error: wsErr } = process.env.WORKSPACE_ID
  ? await wsQuery.eq("id", process.env.WORKSPACE_ID).single()
  : await wsQuery.limit(1).single();
if (wsErr) throw wsErr;
console.log("workspace    :", ws.name, `(${ws.id})`);

const { data: scan, error } = await supabaseAdmin
  .from("scans")
  .insert({
    workspace_id: ws.id,
    requested_by: null,
    target_url: target.url,
    target_domain: target.domain,
    status: "queued",
  })
  .select("id")
  .single();
if (error) throw error;
console.log("scan id      :", scan.id);
console.log("\n--- running the real engine ---");

const started = Date.now();
const result = await runScan(supabaseAdmin, scan.id);
console.log(`\n--- finished in ${((Date.now() - started) / 1000).toFixed(1)}s ---`);
console.log("status  :", result.status);
console.log("score   :", result.score === null ? "null (unavailable)" : result.score);
console.log("findings:", result.findings);
console.log("sources :");
for (const s of result.sources) console.log(`   ${s.source.padEnd(24)} ${s.status}${s.reused ? " (reused)" : ""}`);
console.log("\nSCAN_ID=" + scan.id);
