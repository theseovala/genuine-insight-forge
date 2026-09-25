/**
 * Checks whether the production redirect URI is registered on the Google OAuth
 * client, without performing consent.
 *
 * Google answers an authorization request with `redirect_uri_mismatch` when the
 * URI is not registered, and with the consent/sign-in page when it is. Fetching
 * the URL is enough to tell them apart.
 *
 * Usage: TOKEN=<jwt> bun scripts/google-redirect-check.mjs
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
  console.log("could not get an authorization URL — HTTP", res.status, text.slice(0, 200));
  process.exit(1);
}
const authUrl = match[1].replaceAll("\\u0026", "&").replaceAll("\\", "");
console.log("redirect_uri sent:", new URL(authUrl).searchParams.get("redirect_uri"), "\n");

const page = await fetch(authUrl, {
  redirect: "follow",
  headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36" },
});
const body = await page.text();

const mismatch = /redirect_uri_mismatch/i.test(body);
const blocked = /access[_ ]blocked|has not completed the Google verification/i.test(body);
const consent = /consent|Sign in|Choose an account|accounts\.google\.com\/(signin|v3\/signin)/i.test(body) || /signin/i.test(page.url);

console.log("Google answered: HTTP", page.status, "|", body.length, "bytes");
console.log("  landed on            :", new URL(page.url).origin + new URL(page.url).pathname);
console.log("  redirect_uri_mismatch:", mismatch);
console.log("  access blocked / unverified app:", blocked);
console.log("  sign-in or consent page:", consent);

console.log();
if (mismatch) {
  console.log("RESULT: the redirect URI is NOT registered on this OAuth client yet.");
} else if (blocked) {
  console.log("RESULT: redirect URI accepted, but the consent screen is not published / app not verified.");
} else if (consent) {
  console.log("RESULT: redirect URI is registered — Google is asking the user to sign in and consent.");
} else {
  console.log("RESULT: unclear. First 300 characters of Google's answer:");
  console.log(body.replace(/\s+/g, " ").slice(0, 300));
}
