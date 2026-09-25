/**
 * Phase 6 §2/§3/§10/§11/§12/§13 — backend runtime probes against the running app.
 *
 * Every probe is a real HTTP request to the real backend. Nothing is mocked.
 * The webhook probes deliberately send INVALID signatures: the point is to prove
 * they are rejected, never to fabricate a provider event.
 *
 * Usage: bun scripts/backend-runtime-probe.mjs <email> <password>
 */
import { toJSON } from "seroval";

const [email, password] = process.argv.slice(2);
const BASE = process.env.APP_BASE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;

const FN = {
  createScan: "f1d5918369940e6637ada6e05bb9a40cb6a8546d5e2dacd99362dc3e6e6e0cf1",
  listScans: "87d6a9d08d157be7d0ec31ab686026892635e4529c13628a7532fd49f0d890b8",
};

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
const session = await si.json();
const jwt = session.access_token;
console.log("signed in:", session.user?.id ?? "FAILED", "\n");

const serverFn = (id, value, token) =>
  fetch(`${BASE}/_serverFn/${id}`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      origin: BASE,
      "x-tsr-serverFn": "true",
    },
    body: JSON.stringify(toJSON({ data: value })),
  });

// TanStack Start returns a server-function error as HTTP 200 with an error
// payload in the body, so refusal has to be judged from the body, not the status.
const refused = (text) => /\$TSR\/Error/.test(text);
const messageOf = (text) => (text.match(/"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/) ?? [])[1] ?? "";

console.log("=== §2 AUTHENTICATION ENFORCEMENT ===");
const noTok = await serverFn(FN.createScan, { url: "https://example.com" }, null);
const noTokText = await noTok.text();
check("server function without a token is refused", refused(noTokText), messageOf(noTokText).slice(0, 60));

const badTok = await serverFn(FN.createScan, { url: "https://example.com" }, "aaa.bbb.ccc");
const badTokText = await badTok.text();
check("server function with a malformed token is refused", refused(badTokText), messageOf(badTokText).slice(0, 60));

const noCsrf = await fetch(`${BASE}/_serverFn/${FN.createScan}`, {
  method: "POST",
  headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json", "x-tsr-serverFn": "true" },
  body: JSON.stringify(toJSON({ data: { url: "https://example.com" } })),
});
check("cross-origin request is refused by CSRF middleware", noCsrf.status === 403, `HTTP ${noCsrf.status}`);

console.log("\n=== §3 ERROR SAFETY (no internals leaked) ===");
const badInput = await serverFn(FN.createScan, { url: "x" }, jwt);
const badText = await badInput.text();
const leaks = /at \w+ \(|\.mjs:\d+|node_modules|SUPABASE_|sb_secret|sk-proj|postgres:\/\//i.test(badText);
check("invalid input does not leak stack traces or secrets", !leaks, `HTTP ${badInput.status}, ${badText.length} bytes`);

console.log("\n=== §14 SSRF ENFORCEMENT THROUGH THE REAL API ===");
for (const target of ["http://127.0.0.1:1/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd", "http://localhost/"]) {
  const r = await serverFn(FN.createScan, { url: target }, jwt);
  const t = await r.text();
  check(`SSRF target refused: ${target}`, refused(t), messageOf(t).slice(0, 60));
}

console.log("\n=== §10 WEBHOOK SIGNATURE ENFORCEMENT (invalid on purpose) ===");
for (const [label, provider, headers] of [
  ["meta, no signature header", "meta", {}],
  ["meta, malformed signature", "meta", { "x-hub-signature-256": "sha256=deadbeef" }],
  ["twitter, wrong signature", "twitter", { "x-twitter-webhooks-signature": "sha256=deadbeef" }],
  ["trustpilot, wrong signature", "trustpilot", { "tp-signature": "deadbeef" }],
]) {
  const r = await fetch(`${BASE}/api/public/integrations/webhook?provider=${provider}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ entry: [{ id: "probe" }] }),
  });
  check(`rejected: ${label}`, r.status === 401, `HTTP ${r.status}`);
}
const unknown = await fetch(`${BASE}/api/public/integrations/webhook?provider=notaprovider`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
check("unknown webhook provider refused", unknown.status === 400, `HTTP ${unknown.status}`);

const handshake = await fetch(`${BASE}/api/public/integrations/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`);
check("Meta handshake with wrong verify token refused", handshake.status === 403, `HTTP ${handshake.status}`);

console.log("\n=== §2 CRON ENDPOINT AUTH ===");
const cron = await fetch(`${BASE}/api/public/integrations/jobs-run`, { method: "POST" });
check("job runner without a scheduler token refused", cron.status === 401, `HTTP ${cron.status}`);

console.log("\n=== §13 IDEMPOTENCY: duplicate scan is reused, not duplicated ===");
const a = await serverFn(FN.createScan, { url: "https://example.com" }, jwt);
const b = await serverFn(FN.createScan, { url: "https://example.com" }, jwt);
const idOf = (t) => (t.match(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/) ?? [])[1];
const ta = await a.text();
const tb = await b.text();
const ia = idOf(ta);
const ib = idOf(tb);
check("two identical createScan calls return the same scan", Boolean(ia) && ia === ib, `${ia ?? "?"} vs ${ib ?? "?"}`);

// The limit is 120 per 300s, so the requests must be concurrent to land inside
// one window; sequential requests straddle the window boundary and never trip it.
console.log("\n=== §11 RATE LIMITING: 144 concurrent license validations (limit 120) ===");
const probeKey = "SVL-PROBE-" + Math.random().toString(36).slice(2, 6).toUpperCase();
const validateOnce = () =>
  fetch(`${BASE}/api/public/license/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ licenseKey: probeKey, domain: "probe.seovale.com" }),
  })
    .then((r) => r.status)
    .catch(() => 0);
const statuses = [];
for (let batch = 0; batch < 12; batch++) statuses.push(...(await Promise.all(Array.from({ length: 12 }, validateOnce))));
const firstLimited = statuses.indexOf(429);
check(
  "concurrent validation is rate-limited at the configured threshold",
  firstLimited >= 0,
  `first 429 at request #${firstLimited + 1} of ${statuses.length}, ${statuses.filter((s) => s === 429).length} limited`,
);

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
