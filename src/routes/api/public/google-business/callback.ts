import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/google-business/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (!state || !code || url.searchParams.get("error")) return new Response("Google authorization was cancelled or invalid.", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { decryptSecret, encryptSecret, exchangeGoogleCode, getGoogleAccountEmail, hashValue } = await import("@/lib/google-business.server");
        const { data: states, error } = await supabaseAdmin.rpc("claim_google_oauth_state", { _state_hash: hashValue(state) });
        const saved = states?.[0];
        if (error || !saved) return new Response("This Google authorization link expired. Start again from Settings.", { status: 400 });
        try {
          const storedVerifier = await decryptSecret(saved.code_verifier_ciphertext);
          let verifier = storedVerifier;
          let callbackOrigin = saved.redirect_origin;
          try {
            const stored = JSON.parse(storedVerifier) as { verifier?: unknown; callbackOrigin?: unknown };
            if (typeof stored.verifier === "string") verifier = stored.verifier;
            if (typeof stored.callbackOrigin === "string") callbackOrigin = stored.callbackOrigin;
          } catch {
            // Supports authorization attempts created before stable callbacks were introduced.
          }
          const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");
          const googleCreds = await loadProviderCredentials(supabaseAdmin, saved.workspace_id, "google_business");
          const tokens = await exchangeGoogleCode(code, verifier, `${callbackOrigin}/api/public/google-business/callback`, googleCreds);
          const { data: existing } = await supabaseAdmin.from("google_business_connections").select("refresh_token_ciphertext").eq("workspace_id", saved.workspace_id).maybeSingle();
          const refreshToken = tokens.refreshToken ? await encryptSecret(tokens.refreshToken) : existing?.refresh_token_ciphertext;
          if (!refreshToken) throw new Error("Google did not return offline access.");
          const email = await getGoogleAccountEmail(tokens.accessToken);
          // Google lets the user untick the Business Profile permission on the
          // consent screen. Sign-in scopes alone cannot read or reply to a review,
          // so such a grant is stored as needing reconnection, never as connected.
          const { hasBusinessScope, MISSING_BUSINESS_SCOPE_MESSAGE, probeGoogleBusinessAccess } = await import("@/lib/google-business-sync.server");
          const granted = hasBusinessScope(tokens.scopes);
          // Holding tokens is not the same as having access: Google can still refuse
          // every Business Profile call until it approves the project. One real call
          // decides whether this is reported as connected. It runs before the save,
          // so a probe that throws (timeout, network) can never leave the new tokens
          // stored with no error, which would read as CONNECTED without proof.
          let probe: { code: string; message: string } | null = null;
          if (granted) {
            try {
              probe = await probeGoogleBusinessAccess(tokens.accessToken);
            } catch (caught) {
              probe = { code: "PROVIDER_ERROR", message: `Google Business Profile check failed: ${caught instanceof Error ? caught.message : "no response"}` };
            }
          }
          const { error: saveError } = await supabaseAdmin.from("google_business_connections").upsert({
            workspace_id: saved.workspace_id,
            google_account_email: email,
            access_token_ciphertext: await encryptSecret(tokens.accessToken),
            refresh_token_ciphertext: refreshToken,
            token_expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
            scopes: tokens.scopes,
            status: granted ? "connected" : "needs_reconnect",
            // A reconnect replaces tokens, scopes and the previous error in one write;
            // the error is cleared only when the probe above got authorized data.
            last_error: !granted ? MISSING_BUSINESS_SCOPE_MESSAGE : probe?.code === "CONNECTED" ? null : (probe?.message ?? "Google Business Profile check failed."),
          }, { onConflict: "workspace_id" });
          if (saveError) throw saveError;
          if (!granted) {
            await supabaseAdmin.from("connected_platforms").update({ status: "disconnected", account_ref: email, last_sync_error: MISSING_BUSINESS_SCOPE_MESSAGE }).eq("workspace_id", saved.workspace_id).eq("platform", "google");
            return Response.redirect(`${saved.redirect_origin}/settings?google=permission_missing`, 302);
          }
          if (!probe || probe.code !== "CONNECTED") {
            const message = probe?.message ?? "Google Business Profile check failed.";
            await supabaseAdmin.from("connected_platforms").update({ status: "error", account_ref: email, last_sync_error: message }).eq("workspace_id", saved.workspace_id).eq("platform", "google");
            return Response.redirect(`${saved.redirect_origin}/settings?google=${probe?.code === "APPROVAL_REQUIRED" ? "approval_required" : "error"}`, 302);
          }
          await supabaseAdmin.from("connected_platforms").update({ status: "connected", account_ref: email, last_sync_error: null }).eq("workspace_id", saved.workspace_id).eq("platform", "google");
          return Response.redirect(`${saved.redirect_origin}/settings?google=connected`, 302);
        } catch {
          return Response.redirect(`${saved.redirect_origin}/settings?google=error`, 302);
        }
      },
    },
  },
});