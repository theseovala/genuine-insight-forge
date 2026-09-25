// Follow-up: print the actual response bodies so the verdict is based on
// content, not on the HTTP status that TanStack always returns as 200.
import { toJSON } from "seroval";

const [email, password] = process.argv.slice(2);
const BASE = process.env.APP_BASE;
const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const CREATE = "f1d5918369940e6637ada6e05bb9a40cb6a8546d5e2dacd99362dc3e6e6e0cf1";

const si = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: PUBLISHABLE, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const jwt = (await si.json()).access_token;

const call = async (value, token) => {
  const r = await fetch(`${BASE}/_serverFn/${CREATE}`, {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
      origin: BASE,
      "x-tsr-serverFn": "true",
    },
    body: JSON.stringify(toJSON({ data: value })),
  });
  return { status: r.status, body: await r.text() };
};

const show = async (label, value, token) => {
  const { status, body } = await call(value, token);
  const msg = (body.match(/"message":\{"t":1,"s":"((?:[^"\\]|\\.)*)"/) ?? body.match(/"s":"((?:[^"\\]|\\.)*)"/) ?? [])[1];
  const isError = /\$TSR\/Error|"error"/.test(body);
  console.log(`\n${label}`);
  console.log(`  HTTP ${status} | error payload: ${isError}`);
  console.log(`  message: ${msg ? msg.slice(0, 150) : body.slice(0, 150)}`);
};

await show("A. no token", { url: "https://example.com" }, null);
await show("B. malformed token", { url: "https://example.com" }, "aaa.bbb.ccc");
await show("C. file:// scheme", { url: "file:///etc/passwd" }, jwt);
await show("D. http://localhost/", { url: "http://localhost/" }, jwt);
await show("E. valid duplicate (reuse check)", { url: "https://example.com" }, jwt);
