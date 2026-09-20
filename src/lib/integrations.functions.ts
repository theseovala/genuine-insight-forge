import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTEGRATIONS, integrationById } from "@/lib/integrations/registry";
import type { TestResult } from "@/lib/integrations/providers.server";

type Ctx = { supabase: any; userId: string };

async function workspace(context: Ctx) {
  const { data, error } = await context.supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", context.userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No workspace is assigned to this account.");
  return data as { workspace_id: string; role: "owner" | "admin" | "member" };
}

function requireAdmin(member: { role: string }) {
  if (member.role === "member") throw new Error("Only a workspace owner or admin can manage integrations.");
}

/** Non-secret projection — credential columns are never selected. */
const SAFE_COLUMNS =
  "provider,kind,status,account_ref,account_label,scopes,token_expires_at,connected_at,last_tested_at,last_test_ok,last_error";

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await workspace(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { providerConfigured } = await import("@/lib/integrations/providers.server");
    const { data, error } = await supabaseAdmin
      .from("integration_connections")
      .select(SAFE_COLUMNS)
      .eq("workspace_id", member.workspace_id);
    if (error) throw error;
    const rows = new Map((data ?? []).map((row: any) => [row.provider, row]));

    const google = await context.supabase
      .from("google_business_connections")
      .select("google_account_email,status,last_synced_at,last_error")
      .eq("workspace_id", member.workspace_id)
      .maybeSingle();

    return {
      role: member.role,
      items: INTEGRATIONS.map((definition) => {
        if (definition.id === "google_business") {
          const row = google.data;
          return {
            provider: definition.id,
            configured: providerConfigured(definition.id),
            status: row?.status === "connected" ? "connected" : row?.last_error ? "error" : "disconnected",
            accountLabel: row?.google_account_email ?? null,
            accountRef: null,
            scopes: definition.scopes,
            tokenExpiresAt: null,
            connectedAt: null,
            lastTestedAt: row?.last_synced_at ?? null,
            lastTestOk: row?.status === "connected" ? true : null,
            lastError: row?.last_error ?? null,
          };
        }
        const row = rows.get(definition.id) as any;
        const configured = providerConfigured(definition.id);
        const status =
          definition.kind === "manual"
            ? "unavailable"
            : !configured && !row
              ? "disconnected"
              : (row?.status ?? "disconnected");
        return {
          provider: definition.id,
          configured,
          status,
          accountLabel: row?.account_label ?? null,
          accountRef: row?.account_ref ?? null,
          scopes: row?.scopes?.length ? row.scopes : definition.scopes,
          tokenExpiresAt: row?.token_expires_at ?? null,
          connectedAt: row?.connected_at ?? null,
          lastTestedAt: row?.last_tested_at ?? null,
          lastTestOk: row?.last_test_ok ?? null,
          lastError: row?.last_error ?? null,
        };
      }),
    };
  });

export const listIntegrationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await workspace(context);
    const { data, error } = await context.supabase
      .from("integration_events")
      .select("id,provider,event_type,level,message,http_status,created_at")
      .eq("workspace_id", member.workspace_id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return data ?? [];
  });

export const startIntegrationOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: z.string(), origin: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context);
    requireAdmin(member);
    const definition = integrationById(data.provider);
    if (!definition || definition.kind !== "oauth2") throw new Error("This integration does not use sign-in authorization.");
    const { assertAllowedOrigin, googleCallbackOrigin } = await import("@/lib/google-business.server");
    const { buildAuthorizationUrl, providerConfigured } = await import("@/lib/integrations/providers.server");
    if (!providerConfigured(data.provider)) {
      throw new Error(`${definition.label} is missing its application credentials (${definition.requiredSecrets.join(", ")}).`);
    }
    const { encryptValue, hashState, pkce, randomToken } = await import("@/lib/integrations/crypto.server");
    const origin = assertAllowedOrigin(data.origin);
    const callbackOrigin = googleCallbackOrigin(origin);
    const redirectUri = `${callbackOrigin}/api/public/integrations/callback`;
    const state = randomToken();
    const challenge = definition.id in { google_gmail: 1, youtube: 1, twitter: 1 } ? pkce() : null;
    const codes = challenge ?? { verifier: null, challenge: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integration_oauth_states").insert({
      workspace_id: member.workspace_id,
      user_id: context.userId,
      provider: data.provider,
      state_hash: hashState(state),
      payload_ciphertext: await encryptValue(JSON.stringify({ verifier: codes.verifier, redirectUri })),
      redirect_origin: origin,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    if (error) throw error;
    await supabaseAdmin.from("integration_events").insert({
      workspace_id: member.workspace_id,
      provider: data.provider,
      event_type: "oauth_started",
      level: "info",
      message: `Authorization requested for ${definition.label}.`,
    });
    return { authorizationUrl: buildAuthorizationUrl(data.provider, redirectUri, state, codes.challenge) };
  });

export const saveIntegrationAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: z.string(), accountRef: z.string().trim().min(1).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context);
    requireAdmin(member);
    const definition = integrationById(data.provider);
    if (!definition || definition.kind !== "api_key") throw new Error("This integration does not use a stored business reference.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integration_connections").upsert(
      {
        workspace_id: member.workspace_id,
        provider: data.provider,
        kind: "api_key",
        account_ref: data.accountRef,
        status: "disconnected",
        connected_by: context.userId,
      },
      { onConflict: "workspace_id,provider" },
    );
    if (error) throw error;
    return { saved: true };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context);
    const definition = integrationById(data.provider);
    if (!definition) throw new Error("Unknown integration.");
    if (definition.kind === "manual") throw new Error(definition.manualReason ?? "This integration has no public API.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const providers = await import("@/lib/integrations/providers.server");

    const log = (level: string, message: string, httpStatus: number | null, eventType = "connection_test") =>
      supabaseAdmin.from("integration_events").insert({
        workspace_id: member.workspace_id,
        provider: data.provider,
        event_type: eventType,
        level,
        message: message.slice(0, 500),
        http_status: httpStatus,
      });

    if (definition.id === "google_business") {
      const { data: connection } = await supabaseAdmin
        .from("google_business_connections")
        .select("access_token_ciphertext,refresh_token_ciphertext,token_expires_at,status")
        .eq("workspace_id", member.workspace_id)
        .maybeSingle();
      if (!connection || connection.status !== "connected") throw new Error("Google Business Profile is not connected yet.");
      const { usableAccessToken } = await import("@/lib/google-business-sync.server");
      try {
        const token = await usableAccessToken(supabaseAdmin, member.workspace_id, connection as any);
        const response = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=1", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ok = response.ok;
        await log(ok ? "info" : "error", ok ? "Google Business Profile API reachable." : `Google returned HTTP ${response.status}.`, response.status);
        return { ok, status: response.status, message: ok ? "Google Business Profile API reachable." : `Google returned HTTP ${response.status}.` };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Google test failed.";
        await log("error", message, null);
        return { ok: false, status: 0, message };
      }
    }

    const { data: row } = await supabaseAdmin
      .from("integration_connections")
      .select("*")
      .eq("workspace_id", member.workspace_id)
      .eq("provider", data.provider)
      .maybeSingle();

    let result: TestResult;

    if (definition.kind === "api_key") {
      result =
        definition.id === "trustpilot"
          ? await providers.testTrustpilot(row?.account_ref ?? null)
          : await providers.testTripadvisor(row?.account_ref ?? null);
    } else {
      if (!row?.access_token_ciphertext) throw new Error(`${definition.label} is not connected yet.`);
      const { decryptValue, encryptValue } = await import("@/lib/integrations/crypto.server");
      let accessToken = await decryptValue(row.access_token_ciphertext);
      const expiresSoon = row.token_expires_at ? Date.parse(row.token_expires_at) - Date.now() < 120_000 : false;
      if (expiresSoon) {
        if (!row.refresh_token_ciphertext) {
          await supabaseAdmin
            .from("integration_connections")
            .update({ status: "expired", last_error: "Access expired and the provider issued no refresh token. Reconnect the account." })
            .eq("id", row.id);
          await log("warning", "Access token expired without a refresh token.", null, "token_expired");
          return { ok: false, status: 0, message: "Access expired. Reconnect this account." };
        }
        try {
          const refreshed = await providers.refreshAccessToken(
            data.provider,
            await decryptValue(row.refresh_token_ciphertext),
          );
          accessToken = refreshed.accessToken;
          await supabaseAdmin
            .from("integration_connections")
            .update({
              access_token_ciphertext: await encryptValue(refreshed.accessToken),
              refresh_token_ciphertext: refreshed.refreshToken
                ? await encryptValue(refreshed.refreshToken)
                : row.refresh_token_ciphertext,
              token_expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
              status: "connected",
              last_error: null,
            })
            .eq("id", row.id);
          await log("info", "Access token refreshed.", null, "token_refreshed");
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : "Token refresh failed.";
          await supabaseAdmin.from("integration_connections").update({ status: "expired", last_error: message }).eq("id", row.id);
          await log("error", message, null, "token_refresh_failed");
          return { ok: false, status: 0, message };
        }
      }
      const config = providers.OAUTH_PROVIDERS[data.provider];
      if (!config) throw new Error("Unknown integration.");
      result = await config.test(accessToken);
    }

    const status = result.ok ? "connected" : result.status === 401 || result.status === 403 ? "expired" : "error";
    await supabaseAdmin.from("integration_connections").upsert(
      {
        workspace_id: member.workspace_id,
        provider: data.provider,
        kind: definition.kind,
        status,
        last_tested_at: new Date().toISOString(),
        last_test_ok: result.ok,
        last_error: result.ok ? null : result.message,
        ...(result.label ? { account_label: result.label } : {}),
        ...(result.accountRef ? { account_ref: result.accountRef } : {}),
        ...(result.ok ? { connected_at: row?.connected_at ?? new Date().toISOString() } : {}),
      },
      { onConflict: "workspace_id,provider" },
    );
    await log(
      result.ok ? "info" : result.rateLimited ? "warning" : "error",
      result.rateLimited ? `Rate limited by provider: ${result.message}` : result.message,
      result.status || null,
      result.rateLimited ? "rate_limited" : "connection_test",
    );
    return { ok: result.ok, status: result.status, message: result.message };
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ provider: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context);
    requireAdmin(member);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("integration_connections")
      .delete()
      .eq("workspace_id", member.workspace_id)
      .eq("provider", data.provider);
    if (error) throw error;
    await supabaseAdmin.from("integration_events").insert({
      workspace_id: member.workspace_id,
      provider: data.provider,
      event_type: "disconnected",
      level: "info",
      message: "Connection removed and stored credentials deleted.",
    });
    return { disconnected: true };
  });
