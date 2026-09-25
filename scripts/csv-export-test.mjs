/**
 * Phase 4B §8 — authenticated CSV export through the project's own server
 * function, called exactly the way the browser calls it (seroval cross-JSON
 * payload, same-origin, real JWT). Nothing is faked.
 *
 * Usage: bun scripts/csv-export-test.mjs <email> <password> <scanId>
 */
import { toJSON, fromJSON } from "seroval";

const [email, password, scanId] = process.argv.slice(2);
const BASE = process.env.APP_BASE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;

const FN = {
  getScan: "09f26d0ddfd012856175c79a67053951a7c84e1f5f5cfa85a06a2ffcbbc7abdf",
  exportScanCsv: "9665595a06c31000f26e05b1f3378eecddb6da56ec145a930da132712acf9fdd",
  listScans: "87d6a9d08d157be7d0ec31ab686026892635e4529c13628a7532fd49f0d890b8",
};

const si = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const session = await si.json();
if (!session.access_token) {
  console.log("sign-in failed:", si.status, JSON.stringify(session).slice(0, 200));
  process.exit(1);
}
console.log("sign-in: HTTP", si.status, "| user:", session.user.id);

const call = async (name, value) => {
  const payload = toJSON({ data: value });
  const res = await fetch(`${BASE}/_serverFn/${FN[name]}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
      origin: BASE,
      "x-tsr-serverFn": "true",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, text };
};

const out = await call("exportScanCsv", { id: scanId });
console.log("\nexportScanCsv -> HTTP", out.status);
if (out.status !== 200) {
  console.log("body:", out.text.slice(0, 400));
  process.exit(1);
}

// Walk the seroval node tree for the { filename, csv } record. Decoding the
// whole payload needs TanStack's own plugins, and only these two fields matter.
const unescape = (s) =>
  s.replace(/\\(\\|"|n|r|t|b|f|x3C)/g, (_, ch) =>
    ({ "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", x3C: "<" })[ch],
  );

function findRecord(node) {
  if (!node || typeof node !== "object") return null;
  const keys = node.p?.k;
  if (Array.isArray(keys) && keys.includes("csv")) {
    const out = {};
    keys.forEach((k, i) => {
      const v = node.p.v[i];
      if (v && typeof v.s === "string") out[k] = unescape(v.s);
    });
    return out;
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const c of child) {
        const hit = findRecord(c);
        if (hit) return hit;
      }
    } else if (child && typeof child === "object") {
      const hit = findRecord(child);
      if (hit) return hit;
    }
  }
  return null;
}

const result = findRecord(JSON.parse(out.text.split("\n")[0]));
const csv = result?.csv;
if (typeof csv !== "string") {
  console.log("could not locate csv in response:", out.text.slice(0, 300));
  process.exit(1);
}
console.log("filename:", result.filename);
const lines = csv.split("\n");
console.log("CSV lines:", lines.length, "| bytes:", csv.length);
console.log("\nheader:", lines[0]);
const sections = {};
for (const l of lines.slice(1)) {
  const s = l.split(",")[0].replace(/"/g, "");
  if (s) sections[s] = (sections[s] ?? 0) + 1;
}
console.log("section counts:", JSON.stringify(sections));
console.log("\nfirst rows:");
for (const l of lines.slice(1, 5)) console.log("  ", l.slice(0, 160));
