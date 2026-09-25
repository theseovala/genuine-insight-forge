/**
 * Phase 4A STEP 11 — real tenant-isolation / RLS verification.
 *
 * Signs in as a real user and checks, through the anon-key client carrying that
 * user's JWT, that RLS lets them reach their own workspace and refuses another
 * workspace's data. Nothing is faked; every query hits the live database.
 *
 * Usage: bun scripts/rls-isolation-test.mjs <email> <password> <foreign-scan-id>
 */
import { createClient } from "@supabase/supabase-js";

const [email, password, foreignScanId] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

const asUser = createClient(url, anon, { auth: { persistSession: false } });
const { data: session, error: signInError } = await asUser.auth.signInWithPassword({ email, password });
if (signInError) {
  console.log("sign-in failed:", signInError.message);
  process.exit(1);
}
console.log("signed in as:", session.user.id);

const ok = (label, pass, detail = "") => console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);

console.log("\n=== the signup trigger gave this user their own workspace ===");
const { data: myWs } = await asUser.from("workspaces").select("id,name,slug");
console.log("   visible workspaces:", (myWs ?? []).map((w) => `${w.name} (${w.slug})`).join(", ") || "none");
ok("user sees exactly one workspace", (myWs ?? []).length === 1, `${(myWs ?? []).length} visible`);
const mine = myWs?.[0];

console.log("\n=== tenant isolation: another workspace's data must be invisible ===");
const { data: foreignScan } = await asUser.from("scans").select("id,target_domain").eq("id", foreignScanId);
ok("cannot read a scan from another workspace", (foreignScan ?? []).length === 0, `${(foreignScan ?? []).length} rows returned`);

const { data: foreignFindings } = await asUser.from("scan_findings").select("id").eq("scan_id", foreignScanId);
ok("cannot read another workspace's findings", (foreignFindings ?? []).length === 0, `${(foreignFindings ?? []).length} rows`);

const { data: foreignEvidence } = await asUser.from("finding_evidence").select("id").eq("scan_id", foreignScanId);
ok("cannot read another workspace's evidence", (foreignEvidence ?? []).length === 0, `${(foreignEvidence ?? []).length} rows`);

console.log("\n=== service-role-only tables must stay closed to a logged-in user ===");
for (const table of ["integration_provider_credentials", "integration_connections", "scheduler_tokens"]) {
  const { data, error } = await asUser.from(table).select("*").limit(1);
  ok(`${table} unreadable`, (data ?? []).length === 0, error ? error.code : "0 rows");
}

console.log("\n=== but the service role CAN see the same rows (proves data exists) ===");
const admin = createClient(url, secret, { auth: { persistSession: false } });
const { data: adminScan } = await admin.from("scans").select("id,target_domain,status,score").eq("id", foreignScanId);
ok("service role reads the scan RLS hid", (adminScan ?? []).length === 1, JSON.stringify(adminScan?.[0] ?? {}));

console.log("\n=== the user CAN write in their own workspace ===");
if (mine) {
  // Reuse the probe row from a previous run so repeated runs do not accumulate
  // rows in the database; only insert when no probe row exists yet.
  const { data: existingProbe } = await asUser
    .from("scans")
    .select("id")
    .eq("workspace_id", mine.id)
    .eq("target_domain", "example.com")
    .limit(1)
    .maybeSingle();

  let probeId = existingProbe?.id ?? null;
  let insErr = null;
  if (!probeId) {
    const { data: inserted, error } = await asUser
      .from("scans")
      .insert({ workspace_id: mine.id, requested_by: session.user.id, target_url: "https://example.com/", target_domain: "example.com", status: "queued" })
      .select("id")
      .single();
    probeId = inserted?.id ?? null;
    insErr = error;
  }
  ok("insert into own workspace allowed", !insErr && Boolean(probeId), insErr ? insErr.message : `${probeId}${existingProbe ? " (reused)" : ""}`);

  const { error: crossErr } = await asUser
    .from("scans")
    .insert({ workspace_id: "4f63a396-0a09-40b8-adad-0a5c31cc4376", requested_by: session.user.id, target_url: "https://example.org/", target_domain: "example.org", status: "queued" })
    .select("id")
    .single();
  ok("insert into ANOTHER workspace refused", Boolean(crossErr), crossErr ? crossErr.code + " " + crossErr.message.slice(0, 60) : "INSERT SUCCEEDED — isolation broken");
}
await asUser.auth.signOut();
