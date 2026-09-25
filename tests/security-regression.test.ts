/**
 * Security regression tests. Pure unit tests: network is replaced by an
 * in-memory fetch, the database by an in-memory stub. No row is written
 * anywhere and no provider, model or database is contacted.
 *
 * Run with: bun test tests/
 */

import { afterEach, describe, expect, test } from "bun:test";
import { assertPublicTarget, collectPage, isPrivateAddress } from "../src/lib/scan/collectors.server";
import { assertAllowedOrigin } from "../src/lib/google-business.server";
import { consumeAbuseLimit } from "../src/lib/ops.server";
import { requireStepUp } from "../src/lib/license/access.server";
import { csvCell } from "../src/lib/scan.functions";
import { Route as WebhookRoute } from "../src/routes/api/public/integrations/webhook";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("SSRF guard", () => {
  test("private, loopback, link-local and metadata IPv4 are private", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "198.18.0.1", "192.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  test("IPv6 literals that embed a private IPv4 address are private, including the hex form the URL parser produces", () => {
    for (const ip of ["::1", "fe80::1", "fd00::1", "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  test("ordinary hostnames that start with fc/fd/ff are not mistaken for IPv6 ranges", () => {
    for (const host of ["fdic.gov", "fcbarcelona.com", "ffxiv.com", "fe80.example.com"]) expect(isPrivateAddress(host)).toBe(false);
  });

  test("literal internal targets are refused before any DNS lookup", async () => {
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      throw new Error("network must not be used");
    }) as unknown as typeof fetch;
    for (const target of [
      "http://169.254.169.254/latest/meta-data/",
      "http://[::ffff:169.254.169.254]/",
      "http://2852039166/",
      "http://127.0.0.1/",
      "http://localhost/",
      "http://service.internal/",
      "http://user:pass@example.com/",
      "http://example.com:8080/",
      "ftp://example.com/",
    ]) {
      await expect(assertPublicTarget(target)).rejects.toThrow();
    }
    expect(called).toBe(0);
  });

  test("a redirect from a public host to the metadata address is refused on that hop", async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.startsWith("https://cloudflare-dns.com/")) {
        const type = new URL(url).searchParams.get("type");
        return Response.json(type === "A" ? { Answer: [{ type: 1, data: "93.184.216.34" }] } : { Answer: [] });
      }
      if (url.startsWith("https://redirect-probe.example/")) {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/iam/" } });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
    const result = await collectPage("https://redirect-probe.example/");
    expect(result.status).toBe("failed");
    expect(requested.some((url) => url.includes("169.254.169.254") && !url.startsWith("https://cloudflare-dns.com/"))).toBe(false);
  });
});

describe("OAuth return origin allow-list", () => {
  test("allows only HTTPS app origins and local development", () => {
    expect(assertAllowedOrigin("https://app.seovale.com/settings")).toBe("https://app.seovale.com");
    expect(assertAllowedOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    for (const origin of ["https://evil.com", "https://seovale.com.evil.com", "http://app.seovale.com", "https://evilseovale.com"]) {
      expect(() => assertAllowedOrigin(origin)).toThrow();
    }
  });
});

describe("abuse limits", () => {
  const stub = (result: { data: unknown; error: unknown }) => ({ rpc: async () => result }) as never;

  test("allows up to the limit and refuses past it", async () => {
    expect((await consumeAbuseLimit(stub({ data: 5, error: null }), "b", "k", 5, 60)).allowed).toBe(true);
    expect((await consumeAbuseLimit(stub({ data: 6, error: null }), "b", "k", 5, 60)).allowed).toBe(false);
  });

  test("fails closed when the counter cannot be advanced", async () => {
    expect((await consumeAbuseLimit(stub({ data: null, error: { message: "down" } }), "b", "k", 5, 60)).allowed).toBe(false);
  });

  test("never sends the raw key to the counter", async () => {
    let sent: Record<string, unknown> = {};
    const db = { rpc: async (_name: string, args: Record<string, unknown>) => ((sent = args), { data: 1, error: null }) } as never;
    await consumeAbuseLimit(db, "ai_generate", "user-123", 5, 60);
    expect(String(sent["p_key_hash"])).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(sent)).not.toContain("user-123");
  });
});

describe("step-up grants are single use", () => {
  function db(updatedRows: unknown[]) {
    const chain = (final: unknown): any =>
      new Proxy(
        {},
        {
          get: (_t, prop) => {
            if (prop === "then") return (resolve: (v: unknown) => unknown) => resolve(final);
            if (prop === "maybeSingle") return async () => final;
            return () => chain(final);
          },
        },
      );
    return {
      from: () => ({
        select: () => chain({ data: { id: "grant-1", expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null }),
        update: () => chain({ data: updatedRows, error: null }),
        insert: async () => ({ data: null, error: null }),
      }),
    } as never;
  }

  test("proceeds when this request consumed the grant", async () => {
    await expect(requireStepUp(db([{ id: "grant-1" }]), "u", "download_package")).resolves.toBeUndefined();
  });

  test("refuses when a parallel request already consumed it", async () => {
    await expect(requireStepUp(db([]), "u", "download_package")).rejects.toThrow("STEP_UP_REQUIRED");
  });
});

describe("CSV export", () => {
  test("neutralises spreadsheet formulas from scanned content", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvCell("+cmd")).toBe(`"'+cmd"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("-2+3")).toBe(`"'-2+3"`);
  });

  test("keeps numbers and ordinary text unchanged", () => {
    expect(csvCell(-3)).toBe(`"-3"`);
    expect(csvCell("-0.25")).toBe(`"-0.25"`);
    expect(csvCell("Missing title")).toBe(`"Missing title"`);
    expect(csvCell(null)).toBe(`"DATA NOT AVAILABLE"`);
  });
});

describe("Meta webhook verification handshake", () => {
  const handshake = (token: string) =>
    (WebhookRoute.options as any).server.handlers.GET({
      request: new Request(
        `https://app.seovale.com/api/public/integrations/webhook?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=${encodeURIComponent(token)}`,
      ),
    }) as Promise<Response>;

  test("echoes the challenge only for the configured token", async () => {
    const previous = process.env["META_WEBHOOK_VERIFY_TOKEN"];
    process.env["META_WEBHOOK_VERIFY_TOKEN"] = "verify-token-for-test";
    try {
      const ok = await handshake("verify-token-for-test");
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe("abc123");
      expect((await handshake("verify-token-for-tesX")).status).toBe(403);
      expect((await handshake("short")).status).toBe(403);
      expect((await handshake("")).status).toBe(403);
    } finally {
      if (previous === undefined) delete process.env["META_WEBHOOK_VERIFY_TOKEN"];
      else process.env["META_WEBHOOK_VERIFY_TOKEN"] = previous;
    }
  });
});
