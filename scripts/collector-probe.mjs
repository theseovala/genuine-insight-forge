// Diagnostic: run the http collector alone and print exactly what it returns.
import { collectPage, normalizeTarget } from "../src/lib/scan/collectors.server";
const t = normalizeTarget(process.argv[2]);
console.log("url:", t.url);
const r = await collectPage(t.url);
console.log("source      :", r.source);
console.log("status      :", r.status);
console.log("httpStatus  :", r.httpStatus);
console.log("durationMs  :", r.durationMs);
console.log("errorMessage:", r.errorMessage);
console.log("raw keys    :", Object.keys(r.raw ?? {}).join(", "));
console.log("html bytes  :", String((r.raw ?? {}).html ?? "").length);
