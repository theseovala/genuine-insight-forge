// Real provider wiring: authorization URLs, token exchange/refresh and live
// connection tests. Every call below hits the provider's documented API — no
// simulated responses and no success status without a real HTTP 2xx.
import { integrationById } from "./registry";

export interface TestResult {
  ok: boolean;
  status: number;
  message: string;
  label?: string | null;
  accountRef?: string | null;
  rateLimited?: boolean;
}

export interface OAuthProviderConfig {
  authUrl: string;
  tokenUrl: string;
  clientIdEnv: string[];
  clientSecretEnv: string[];
  usePkce: boolean;
  tokenAuth: "basic" | "body";
  extraAuthParams?: Record<string, string>;
  headers?: Record<string, string>;
  test: (accessToken: string) => Promise<TestResult>;
}

const USER_AGENT = "Seovale/1.0 (reputation monitoring)";

export function envValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return { raw: text.slice(0, 200) } as Record<string, any>;
  }
}

function failure(response: Response, payload: Record<string, any>): TestResult {
  const message =
    payload?.["error"]?.["message"] ??
    (typeof payload?.["error"] === "string" ? payload["error"] : undefined) ??
    payload?.["message"] ??
    payload?.["detail"] ??
    `Provider returned HTTP ${response.status}`;
  return {
    ok: false,
    status: response.status,
    message: String(message).slice(0, 300),
    rateLimited: response.status === 429,
  };
}

async function googleTest(url: string, accessToken: string, pick: (p: Record<string, any>) => { label?: string | null; ref?: string | null }) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await readJson(response);
  if (!response.ok) return failure(response, payload);
  const picked = pick(payload);
  return { ok: true, status: response.status, message: "Live API call succeeded.", label: picked.label ?? null, accountRef: picked.ref ?? null };
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google_gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_ID"],
    clientSecretEnv: ["GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_BUSINESS_CLIENT_SECRET"],
    usePkce: true,
    tokenAuth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" },
    test: (token) =>
      googleTest("https://gmail.googleapis.com/gmail/v1/users/me/profile", token, (p) => ({
        label: p["emailAddress"],
        ref: p["emailAddress"],
      })),
  },
  youtube: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_BUSINESS_CLIENT_ID"],
    clientSecretEnv: ["GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_BUSINESS_CLIENT_SECRET"],
    usePkce: true,
    tokenAuth: "body",
    extraAuthParams: { access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" },
    test: (token) =>
      googleTest("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", token, (p) => {
        const item = (p["items"] ?? [])[0];
        return { label: item?.["snippet"]?.["title"] ?? null, ref: item?.["id"] ?? null };
      }),
  },
  facebook: {
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdEnv: ["FACEBOOK_APP_ID"],
    clientSecretEnv: ["FACEBOOK_APP_SECRET"],
    usePkce: false,
    tokenAuth: "body",
    test: async (token) => {
      const response = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name&access_token=${encodeURIComponent(token)}`);
      const payload = await readJson(response);
      if (!response.ok) return failure(response, payload);
      const page = (payload["data"] ?? [])[0];
      if (!page) {
        return { ok: false, status: response.status, message: "No Facebook Page is available to this account. Grant Page access in the Meta Business portfolio." };
      }
      return { ok: true, status: response.status, message: "Live Graph API call succeeded.", label: page["name"], accountRef: page["id"] };
    },
  },
  instagram: {
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    clientIdEnv: ["FACEBOOK_APP_ID"],
    clientSecretEnv: ["FACEBOOK_APP_SECRET"],
    usePkce: false,
    tokenAuth: "body",
    test: async (token) => {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`,
      );
      const payload = await readJson(response);
      if (!response.ok) return failure(response, payload);
      const linked = (payload["data"] ?? []).map((row: Record<string, any>) => row["instagram_business_account"]).find(Boolean);
      if (!linked) {
        return { ok: false, status: response.status, message: "No Instagram professional account is linked to the authorized Facebook Page." };
      }
      return { ok: true, status: response.status, message: "Live Graph API call succeeded.", label: linked["username"] ?? null, accountRef: linked["id"] };
    },
  },
  reddit: {
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    clientIdEnv: ["REDDIT_CLIENT_ID"],
    clientSecretEnv: ["REDDIT_CLIENT_SECRET"],
    usePkce: false,
    tokenAuth: "basic",
    extraAuthParams: { duration: "permanent" },
    headers: { "User-Agent": USER_AGENT },
    test: async (token) => {
      const response = await fetch("https://oauth.reddit.com/api/v1/me", {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
      });
      const payload = await readJson(response);
      if (!response.ok) return failure(response, payload);
      return { ok: true, status: response.status, message: "Live Reddit API call succeeded.", label: payload["name"] ? `u/${payload["name"]}` : null, accountRef: payload["id"] ?? null };
    },
  },
  twitter: {
    authUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientIdEnv: ["TWITTER_CLIENT_ID"],
    clientSecretEnv: ["TWITTER_CLIENT_SECRET"],
    usePkce: true,
    tokenAuth: "basic",
    test: async (token) => {
      const response = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await readJson(response);
      if (!response.ok) return failure(response, payload);
      const user = payload["data"] ?? {};
      return { ok: true, status: response.status, message: "Live X API call succeeded.", label: user["username"] ? `@${user["username"]}` : null, accountRef: user["id"] ?? null };
    },
  },
};

export function providerConfigured(providerId: string) {
  const oauth = OAUTH_PROVIDERS[providerId];
  if (oauth) return Boolean(envValue(oauth.clientIdEnv) && envValue(oauth.clientSecretEnv));
  const definition = integrationById(providerId);
  if (!definition || definition.requiredSecrets.length === 0) return false;
  return definition.requiredSecrets.every((name) => Boolean(process.env[name]));
}

export function buildAuthorizationUrl(providerId: string, redirectUri: string, state: string, challenge: string | null) {
  const config = OAUTH_PROVIDERS[providerId];
  const definition = integrationById(providerId);
  if (!config || !definition) throw new Error("This integration does not support OAuth.");
  const clientId = envValue(config.clientIdEnv);
  if (!clientId) throw new Error(`${config.clientIdEnv[0]} is not configured.`);
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", definition.scopes.join(" "));
  url.searchParams.set("state", state);
  for (const [k, v] of Object.entries(config.extraAuthParams ?? {})) url.searchParams.set(k, v);
  if (config.usePkce && challenge) {
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

async function tokenRequest(providerId: string, body: URLSearchParams) {
  const config = OAUTH_PROVIDERS[providerId];
  if (!config) throw new Error("Unknown OAuth integration.");
  const clientId = envValue(config.clientIdEnv);
  const clientSecret = envValue(config.clientSecretEnv);
  if (!clientId || !clientSecret) throw new Error("This integration is missing its application credentials.");
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", ...(config.headers ?? {}) };
  if (config.tokenAuth === "basic") {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    body.set("client_id", clientId);
  } else {
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }
  const response = await fetch(config.tokenUrl, { method: "POST", headers, body });
  const payload = await readJson(response);
  if (!response.ok || typeof payload["access_token"] !== "string") {
    const detail = payload["error_description"] ?? payload["error"] ?? `HTTP ${response.status}`;
    throw new Error(`Token request failed: ${String(detail).slice(0, 200)}`);
  }
  return {
    accessToken: payload["access_token"] as string,
    refreshToken: typeof payload["refresh_token"] === "string" ? payload["refresh_token"] : null,
    expiresIn: typeof payload["expires_in"] === "number" ? payload["expires_in"] : 3600,
    scopes: typeof payload["scope"] === "string" ? payload["scope"].split(/[\s,]+/).filter(Boolean) : [],
  };
}

export function exchangeCode(providerId: string, code: string, verifier: string | null, redirectUri: string) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (verifier) body.set("code_verifier", verifier);
  return tokenRequest(providerId, body);
}

export function refreshAccessToken(providerId: string, refreshToken: string) {
  return tokenRequest(providerId, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

/** Long-lived Meta user token (60 days) — short-lived tokens expire in ~1 hour. */
export async function exchangeMetaLongLivedToken(shortLivedToken: string) {
  const clientId = process.env["FACEBOOK_APP_ID"];
  const clientSecret = process.env["FACEBOOK_APP_SECRET"];
  if (!clientId || !clientSecret) return null;
  const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  const response = await fetch(url.toString());
  const payload = await readJson(response);
  if (!response.ok || typeof payload["access_token"] !== "string") return null;
  return {
    accessToken: payload["access_token"] as string,
    expiresIn: typeof payload["expires_in"] === "number" ? payload["expires_in"] : 5_184_000,
  };
}

/* ---------- API-key providers ---------- */

export async function testTrustpilot(domain: string | null): Promise<TestResult> {
  const apiKey = process.env["TRUSTPILOT_API_KEY"];
  if (!apiKey) return { ok: false, status: 0, message: "TRUSTPILOT_API_KEY is not configured." };
  if (!domain) return { ok: false, status: 0, message: "Add your Trustpilot business domain first." };
  const url = new URL("https://api.trustpilot.com/v1/business-units/find");
  url.searchParams.set("name", domain);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url.toString());
  const payload = await readJson(response);
  if (!response.ok) return failure(response, payload);
  return {
    ok: true,
    status: response.status,
    message: "Trustpilot business unit resolved.",
    label: payload["displayName"] ?? domain,
    accountRef: payload["id"] ?? domain,
  };
}

export async function testTripadvisor(query: string | null): Promise<TestResult> {
  const apiKey = process.env["TRIPADVISOR_API_KEY"];
  if (!apiKey) return { ok: false, status: 0, message: "TRIPADVISOR_API_KEY is not configured." };
  if (!query) return { ok: false, status: 0, message: "Add your Tripadvisor listing name or location ID first." };
  const numeric = /^\d+$/.test(query);
  const url = numeric
    ? new URL(`https://api.content.tripadvisor.com/api/v1/location/${query}/details`)
    : new URL("https://api.content.tripadvisor.com/api/v1/location/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  if (!numeric) url.searchParams.set("searchQuery", query);
  const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  const payload = await readJson(response);
  if (!response.ok) return failure(response, payload);
  const match = numeric ? payload : (payload["data"] ?? [])[0];
  if (!match) return { ok: false, status: response.status, message: "Tripadvisor returned no listing for that name." };
  return {
    ok: true,
    status: response.status,
    message: "Tripadvisor listing resolved.",
    label: match["name"] ?? query,
    accountRef: String(match["location_id"] ?? query),
  };
}
