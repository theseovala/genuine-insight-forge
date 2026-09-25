/**
 * Verifies that the live site refuses map/review/shortener links and still
 * accepts a real business website. Run against production.
 *
 * Usage: TOKEN=<jwt> APP_BASE=https://seovale.com bun scripts/listing-link-test.mjs
 */
import { toJSON } from "seroval";

const BASE = process.env.APP_BASE ?? "https://seovale.com";
const TOKEN = process.env.TOKEN;
const CREATE_SCAN = "f1d5918369940e6637ada6e05bb9a40cb6a8546d5e2dacd99362dc3e6e6e0cf1";

const messageOf = (text) => {
  const m = text.match(/"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  return m[1]
    .replace(/\\u2192/g, "->")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ");
};
const uuidOf = (text) => (text.match(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/) ?? [])[1];

const cases = [
  ["Google review share link", "https://share.google/qYdfjLPZ6mFrskJaR", "refuse"],
  ["Google Maps app link", "https://maps.app.goo.gl/BbweVQaBacgT7EzM6", "refuse"],
  ["old goo.gl maps link", "https://goo.gl/maps/6DFaVuC7cPwk6zmr8?g_st=ac", "refuse"],
  ["google.com/maps place", "https://www.google.com/maps/place/xyz", "refuse"],
  ["bit.ly shortener", "https://bit.ly/abc123", "refuse"],
  ["Facebook page", "https://www.facebook.com/somebusiness", "refuse"],
  ["real business website", "https://seovale.com", "accept"],
];

let pass = 0;
let fail = 0;

for (const [label, url, expected] of cases) {
  const res = await fetch(`${BASE}/_serverFn/${CREATE_SCAN}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      origin: BASE,
      "x-tsr-serverFn": "true",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(toJSON({ data: { url } })),
  });
  const text = await res.text();
  const refused = /\$TSR\/Error/.test(text);
  const actual = refused ? "refuse" : "accept";
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`\n${ok ? "PASS" : "FAIL"}  ${label}`);
  console.log(`      ${url}`);
  console.log(`      ${refused ? "refused: " + String(messageOf(text)).slice(0, 150) : "accepted: scan " + uuidOf(text)}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
