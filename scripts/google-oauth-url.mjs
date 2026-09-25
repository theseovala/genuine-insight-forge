/**
 * Prints the exact production Google OAuth parameters the app will send, so the
 * redirect URI and scope can be registered in Google Cloud without guessing.
 *
 * Usage: TOKEN=<jwt> bun scripts/google-oauth-url.mjs
 */
import { toJSON } from "seroval";

const BASE = process.env.APP_BASE ?? "https://seovale.com";
const START_GBP = "a63d1fc244b2ba730af1671cc705de67a2e5198afd2ff710e8cdb27fb0593662";

const res = await fetch(`${BASE}/_serverFn/${START_GBP}`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.TOKEN}`,
    "content-type": "application/json",
    origin: BASE,
    "x-tsr-serverFn": "true",
    "sec-fetch-site": "same-origin",
  },
  body: JSON.stringify(toJSON({ data: { origin: BASE } })),
});
const text = await res.text();
const match = text.match(/"(https:\/\/accounts\.google\.com[^"]+)"/);
if (!match) {
  console.log("HTTP", res.status, "| body:", text.slice(0, 300));
  process.exit(1);
}

const raw = match[1].replaceAll("\\u0026", "&").replaceAll("\\", "");
const url = new URL(raw);
const p = url.searchParams;

console.log("Production authorization request the app will make:\n");
console.log("  endpoint       :", url.origin + url.pathname);
console.log("  redirect_uri   :", p.get("redirect_uri"));
console.log("  scope          :", p.get("scope"));
console.log("  access_type    :", p.get("access_type"));
console.log("  prompt         :", p.get("prompt"));
console.log("  include_granted:", p.get("include_granted_scopes"));
console.log("  client_id tail : ..." + String(p.get("client_id")).slice(-32));
console.log("\nRegister that exact redirect_uri in Google Cloud → Credentials → your OAuth client.");
