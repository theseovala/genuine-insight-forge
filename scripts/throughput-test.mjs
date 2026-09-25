/**
 * Measures real scan throughput on the production server.
 *
 * Runs N scans concurrently against public reference sites and reports wall
 * clock, per-scan time and the implied scans-per-hour. Scans are the product's
 * normal, robots-aware, single-page-plus-crawl requests — no load generation.
 *
 * Usage: TOKEN=<jwt> CONCURRENCY=5 bun scripts/throughput-test.mjs
 */
import { toJSON } from "seroval";

const BASE = process.env.APP_BASE ?? "https://seovale.com";
const TOKEN = process.env.TOKEN;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);

const FN = {
  createScan: "f1d5918369940e6637ada6e05bb9a40cb6a8546d5e2dacd99362dc3e6e6e0cf1",
  runScanNow: "cc9a0890b4e4d3fac487f71e5fbf7e35f0143caef82f043cf224891ebfcee962",
};

// Public reference sites, each scanned once.
const TARGETS = [
  "https://example.com",
  "https://example.org",
  "https://example.net",
  "https://www.iana.org",
  "https://www.w3.org",
  "https://www.rfc-editor.org",
  "https://httpbin.org",
  "https://www.unicode.org",
];

const call = (name, value) =>
  fetch(`${BASE}/_serverFn/${FN[name]}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
      origin: BASE,
      "x-tsr-serverFn": "true",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(toJSON({ data: value })),
    signal: AbortSignal.timeout(300000),
  }).then(async (r) => ({ status: r.status, text: await r.text() }));

const uuidOf = (t) => (t.match(/"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/) ?? [])[1];

const targets = TARGETS.slice(0, CONCURRENCY);
console.log(`running ${targets.length} scans concurrently against ${BASE}\n`);

const started = Date.now();
const results = await Promise.all(
  targets.map(async (url) => {
    const t0 = Date.now();
    const created = await call("createScan", { url });
    const id = uuidOf(created.text);
    if (!id) return { url, ok: false, detail: `createScan HTTP ${created.status}` };
    const ran = await call("runScanNow", { id });
    const seconds = (Date.now() - t0) / 1000;
    const scoreMatch = ran.text.match(/"score","findings"/) ? ran.text : ran.text;
    return {
      url,
      ok: ran.status === 200,
      seconds,
      id,
      status: (scoreMatch.match(/"(completed[a-z_]*|failed)"/) ?? [])[1] ?? "?",
    };
  }),
);
const wall = (Date.now() - started) / 1000;

for (const r of results) {
  console.log(
    `  ${r.ok ? "OK  " : "FAIL"} ${String(r.url).padEnd(28)} ${r.seconds ? r.seconds.toFixed(1) + "s" : ""} ${r.status ?? r.detail ?? ""}`,
  );
}

const done = results.filter((r) => r.ok);
const avg = done.length ? done.reduce((s, r) => s + r.seconds, 0) / done.length : 0;
console.log(`\nwall clock          : ${wall.toFixed(1)}s for ${targets.length} scans`);
console.log(`average per scan    : ${avg.toFixed(1)}s`);
console.log(`succeeded           : ${done.length}/${targets.length}`);
console.log(`throughput at this concurrency : ${((targets.length / wall) * 3600).toFixed(0)} scans/hour`);
