/**
 * Runs the real Google Business review sync against the live site and prints
 * whatever Google actually answered. No simulation.
 *
 * Usage: TOKEN=<jwt> bun scripts/gb-sync-test.mjs
 */
import { toJSON } from "seroval";

const BASE = process.env.APP_BASE ?? "https://seovale.com";
const SYNC = "39cb8781f5a9e6604930b188345fc744636e1e19078f1e77d94d94b0a9d108c2";
const STATUS = "1b2c3d";

const messageOf = (text) => {
  const m = text.match(/"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/);
  return m ? m[1].replace(/\\"/g, '"').replace(/\\n/g, " ") : null;
};

const res = await fetch(`${BASE}/_serverFn/${SYNC}`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${process.env.TOKEN}`,
    "content-type": "application/json",
    origin: BASE,
    "x-tsr-serverFn": "true",
    "sec-fetch-site": "same-origin",
  },
  body: JSON.stringify(toJSON({ data: {} })),
});
const text = await res.text();

console.log("syncGoogleBusinessReviews -> HTTP", res.status);
console.log("  is error payload :", /\$TSR\/Error/.test(text));
const msg = messageOf(text);
console.log("  message          :", msg ? msg.slice(0, 500) : text.slice(0, 500));
void STATUS;
