/**
 * Phase 6 §4/§5/§16 — provider-by-provider live test through the project's own
 * integration gateway, called as an authenticated server function exactly the
 * way the Integration Manager button does.
 *
 * Every result is whatever the real adapter returned. Nothing is simulated.
 *
 * Usage: bun scripts/integration-matrix-test.mjs <email> <password>
 */
import { toJSON } from "seroval";
import { INTEGRATIONS } from "../src/lib/integrations/registry";

const [email, password] = process.argv.slice(2);
const BASE = process.env.APP_BASE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;

const FN = { testIntegration: "fbccdbb0094e2a0bad1e1a685249c2df0ccf4d93f723591e1326f85ef4301d77" };

const si = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const session = await si.json();
if (!session.access_token) {
  console.log("sign-in failed:", si.status);
  process.exit(1);
}
console.log("signed in:", session.user.id, "\n");

const find = (node, key) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node.p?.k) && node.p.k.includes(key)) {
    const out = {};
    node.p.k.forEach((k, i) => {
      const v = node.p.v[i];
      out[k] = v?.s ?? (v?.t === 2 ? true : v?.t === 3 ? false : v?.t === 0 ? null : undefined);
    });
    return out;
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const cc of child) {
        const hit = find(cc, key);
        if (hit) return hit;
      }
    } else if (child && typeof child === "object") {
      const hit = find(child, key);
      if (hit) return hit;
    }
  }
  return null;
};

const rows = [];
for (const def of INTEGRATIONS) {
  let code = "REQUEST_FAILED";
  let message = "";
  try {
    const res = await fetch(`${BASE}/_serverFn/${FN.testIntegration}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
        origin: BASE,
        "x-tsr-serverFn": "true",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify(toJSON({ data: { provider: def.id } })),
    });
    const text = await res.text();
    const rec = find(JSON.parse(text.split("\n")[0]), "code");
    code = rec?.code ?? `HTTP_${res.status}`;
    message = (rec?.message ?? "").slice(0, 58);
  } catch (e) {
    message = String(e).slice(0, 58);
  }
  rows.push({ provider: def.id, group: def.group, kind: def.kind, code, message });
  console.log(`  ${def.id.padEnd(24)} ${String(def.kind).padEnd(9)} ${code.padEnd(22)} ${message}`);
}

console.log("\n=== SUMMARY BY OUTCOME CODE ===");
const byCode = {};
for (const r of rows) byCode[r.code] = (byCode[r.code] ?? 0) + 1;
for (const [k, v] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${v}`);
console.log(`\n  total providers tested: ${rows.length}`);
