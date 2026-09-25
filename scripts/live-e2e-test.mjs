/**
 * End-to-end test against the live production site.
 *
 * Signs in as a real user, creates a real scan, runs the real engine, then reads
 * the stored result and exports the CSV — all through the deployed server
 * functions. Nothing is simulated.
 *
 * Usage: APP_BASE=https://seovale.com bun scripts/live-e2e-test.mjs <email> <password> <url-to-scan>
 */
import { toJSON } from "seroval";

const [email, password, scanUrl] = process.argv.slice(2);
const BASE = process.env.APP_BASE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;

const FN = {
  createScan: "f1d5918369940e6637ada6e05bb9a40cb6a8546d5e2dacd99362dc3e6e6e0cf1",
  runScanNow: "cc9a0890b4e4d3fac487f71e5fbf7e35f0143caef82f043cf224891ebfcee962",
  getScan: "09f26d0ddfd012856175c79a67053951a7c84e1f5f5cfa85a06a2ffcbbc7abdf",
  listScans: "87d6a9d08d157be7d0ec31ab686026892635e4529c13628a7532fd49f0d890b8",
  exportScanCsv: "9665595a06c31000f26e05b1f3378eecddb6da56ec145a930da132712acf9fdd",
};

const t0 = Date.now();
const step = (label) => console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

step("1. sign in against the live site");
const si = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const session = await si.json();
if (!session.access_token) {
  console.log("   FAILED:", JSON.stringify(session).slice(0, 200));
  process.exit(1);
}
console.log("   HTTP", si.status, "| user", session.user.id);

const call = async (name, value, timeoutMs = 300000) => {
  const res = await fetch(`${BASE}/_serverFn/${FN[name]}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
      origin: BASE,
      "x-tsr-serverFn": "true",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(toJSON({ data: value })),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, text: await res.text() };
};

// Pull the { ...keys } record containing `key` out of the seroval node tree.
const unescape = (s) =>
  s.replace(/\\(\\|"|n|r|t|b|f|x3C)/g, (_, c) => ({ "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", x3C: "<" })[c]);
function find(node, key) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node.p?.k) && node.p.k.includes(key)) {
    const out = {};
    node.p.k.forEach((k, i) => {
      const v = node.p.v[i];
      out[k] = typeof v?.s === "string" ? unescape(v.s) : v?.i !== undefined ? v : v?.s;
    });
    return out;
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const c of child) { const hit = find(c, key); if (hit) return hit; }
    } else if (child && typeof child === "object") {
      const hit = find(child, key); if (hit) return hit;
    }
  }
  return null;
}
const firstUuid = (t) => (t.match(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/) ?? [])[1];

step(`2. createScan for ${scanUrl}`);
const created = await call("createScan", { url: scanUrl });
const scanId = firstUuid(created.text);
console.log("   HTTP", created.status, "| scan id", scanId ?? "NONE");
if (!scanId) { console.log("   body:", created.text.slice(0, 300)); process.exit(1); }

step("3. runScanNow — real engine, real network calls (takes ~45s)");
const ranAt = Date.now();
const ran = await call("runScanNow", { id: scanId });
console.log("   HTTP", ran.status, `| took ${((Date.now() - ranAt) / 1000).toFixed(1)}s`);
const summary = find(JSON.parse(ran.text.split("\n")[0]), "findings");
if (summary) console.log("   status:", summary.status, "| score:", summary.score?.s ?? summary.score, "| findings:", summary.findings?.s ?? summary.findings);

step("4. getScan — read what was stored");
const got = await call("getScan", { id: scanId });
const raw = got.text;
const count = (re) => (raw.match(re) ?? []).length;
console.log("   HTTP", got.status, "|", raw.length, "bytes returned");
console.log("   stage rows in payload   :", count(/"stage"/g));
console.log("   source rows in payload  :", count(/"http_status"/g));
console.log("   finding rows in payload :", count(/"priority_rank"/g));

step("5. exportScanCsv");
const csvRes = await call("exportScanCsv", { id: scanId });
const rec = find(JSON.parse(csvRes.text.split("\n")[0]), "csv");
console.log("   HTTP", csvRes.status);
if (rec?.csv) {
  const lines = rec.csv.split("\n");
  const sections = {};
  for (const l of lines.slice(1)) { const s = l.split(",")[0].replace(/"/g, ""); if (s) sections[s] = (sections[s] ?? 0) + 1; }
  console.log("   filename :", rec.filename);
  console.log("   lines    :", lines.length, "| bytes:", rec.csv.length);
  console.log("   sections :", JSON.stringify(sections));
} else {
  console.log("   csv not found in response:", csvRes.text.slice(0, 200));
}

console.log(`\nSCAN_ID=${scanId}`);
console.log(`total elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
