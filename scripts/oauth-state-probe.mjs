/**
 * Phase 6B §1 — OAuth state security, tested against the real backend.
 *
 * SECURITY/LOGIC TEST — NOT PROVIDER RUNTIME. No provider consent is performed
 * and no provider response is fabricated; this exercises the project's own
 * state issuing and callback validation.
 *
 * Usage: bun scripts/oauth-state-probe.mjs <email> <password>
 */
import { toJSON } from "seroval";
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
const BASE = process.env.APP_BASE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

const START_GBP = "a63d1fc244b2ba730af1671cc705de67a2e5198afd2ff710e8cdb27fb0593662";

let pass = 0;
let fail = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const si = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const jwt = (await si.json()).access_token;
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

console.log("=== §1 CALLBACK REJECTS BAD STATE ===");
const cb = (qs) => fetch(`${BASE}/api/public/google-business/callback?${qs}`, { redirect: "manual" });

const noState = await cb("code=fake-code");
check("callback without a state value is refused", noState.status === 400, `HTTP ${noState.status}`);

const unknown = await cb("code=fake-code&state=" + "z".repeat(48));
const unknownBody = await unknown.text();
check(
  "callback with an unknown state is refused",
  unknown.status >= 400 || /state|expired|invalid/i.test(unknownBody),
  `HTTP ${unknown.status} ${unknownBody.slice(0, 60)}`,
);

console.log("\n=== §1 REAL STATE ISSUANCE (no consent performed) ===");
const startRes = await fetch(`${BASE}/_serverFn/${START_GBP}`, {
  method: "POST",
  headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json", origin: BASE, "x-tsr-serverFn": "true", "sec-fetch-site": "same-origin" },
  body: JSON.stringify(toJSON({ data: { origin: BASE } })),
});
const startText = await startRes.text();
const authUrl = (startText.match(/"(https:\/\/accounts\.google\.com[^"]+)"/) ?? [])[1];
check("authorization URL issued", Boolean(authUrl), authUrl ? "accounts.google.com/..." : startText.slice(0, 120));

if (authUrl) {
  const u = new URL(authUrl.replace(/\\u0026/g, "&").replace(/\\/g, ""));
  const p = u.searchParams;
  check("URL targets Google's real authorization endpoint", u.origin === "https://accounts.google.com", u.pathname);
  check("client_id present", Boolean(p.get("client_id")), "(value not shown)");
  check("business.manage scope requested", (p.get("scope") ?? "").includes("business.manage"), p.get("scope")?.slice(0, 40));
  check("offline access requested (needed for refresh tokens)", p.get("access_type") === "offline", String(p.get("access_type")));
  check("state parameter present", Boolean(p.get("state")), `${(p.get("state") ?? "").length} chars`);
  check("state is long enough to resist guessing", (p.get("state") ?? "").length >= 32, `${(p.get("state") ?? "").length} chars`);

  // The stored row must never contain the state in the clear.
  const { data: rows } = await admin
    .from("google_oauth_states")
    .select("id,state_hash,code_verifier_ciphertext,expires_at,used_at,created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0];
  check("state row persisted server-side", Boolean(row), row ? "google_oauth_states" : "none");
  if (row) {
    check("only a hash of the state is stored, never the raw value", row.state_hash !== p.get("state"), "hash ≠ state");
    const ttl = (new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 1000;
    check("state expires", ttl > 0 && ttl <= 1800, `${Math.round(ttl)}s TTL`);
    check("state starts unused", row.used_at === null, "used_at is null");

    // Single-use: claim it twice through the real callback.
    const first = await cb(`code=fake-code&state=${encodeURIComponent(p.get("state"))}`);
    const firstBody = await first.text();
    const { data: after } = await admin.from("google_oauth_states").select("used_at").eq("id", row.id).single();
    check("first callback consumes the state", after?.used_at !== null, `used_at set, HTTP ${first.status}`);
    // A failed code exchange must never redirect back as a success. This is the
    // check that would catch a fake "connected" state.
    const location = first.headers.get("location") ?? "";
    const signalsError = /error|failed|denied/i.test(location);
    const signalsSuccess = /success|connected=1|connected=true/i.test(location);
    check(
      "failed code exchange redirects with an error, never a success",
      signalsError && !signalsSuccess,
      `HTTP ${first.status} → ${location.slice(0, 90) || firstBody.slice(0, 60)}`,
    );

    const second = await cb(`code=fake-code&state=${encodeURIComponent(p.get("state"))}`);
    const secondBody = await second.text();
    check(
      "replaying the same state is refused (single-use)",
      second.status >= 400 || /state|expired|invalid/i.test(secondBody),
      `HTTP ${second.status} ${secondBody.slice(0, 50)}`,
    );

    // Expiry: force a fresh state to be expired and replay it.
    const startAgain = await fetch(`${BASE}/_serverFn/${START_GBP}`, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json", origin: BASE, "x-tsr-serverFn": "true", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(toJSON({ data: { origin: BASE } })),
    });
    const againUrl = ((await startAgain.text()).match(/"(https:\/\/accounts\.google\.com[^"]+)"/) ?? [])[1];
    if (againUrl) {
      const state2 = new URL(againUrl.replace(/\\u0026/g, "&").replace(/\\/g, "")).searchParams.get("state");
      const { data: r2 } = await admin
        .from("google_oauth_states")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1);
      await admin
        .from("google_oauth_states")
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", r2[0].id);
      const expired = await cb(`code=fake-code&state=${encodeURIComponent(state2)}`);
      const expiredBody = await expired.text();
      check(
        "expired state is refused",
        expired.status >= 400 || /state|expired|invalid/i.test(expiredBody),
        `HTTP ${expired.status} ${expiredBody.slice(0, 50)}`,
      );
    }
  }
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
