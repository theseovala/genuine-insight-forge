import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function workspace(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.from("workspace_members").select("workspace_id, role").eq("user_id", context.userId).order("created_at").limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No workspace is assigned to this account.");
  return data as { workspace_id: string; role: "owner" | "admin" | "member" };
}

export const getGoogleBusinessConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await workspace(context);
    // Token ciphertext is owner/admin-only at the database level, so this status read
    // runs server-side after membership has already been verified above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("google_business_connections").select("google_account_email,status,last_synced_at,last_error,scopes").eq("workspace_id", member.workspace_id).maybeSingle();
    if (error) throw error;
    // A stored "connected" row without the business.manage grant cannot read or
    // reply to a single review, so it is not reported as connected.
    const { googleBusinessState, googleNextAction } = await import("./google-business-sync.server");
    const state = googleBusinessState(data);
    const nextAction = googleNextAction(state.code);
    return {
      configured: Boolean(process.env["GOOGLE_BUSINESS_CLIENT_ID"] && process.env["GOOGLE_BUSINESS_CLIENT_SECRET"]),
      connected: state.code === "CONNECTED",
      email: data?.google_account_email ?? null,
      status: data && state.code !== "CONNECTED" && data.status === "connected" ? "needs_reconnect" : (data?.status ?? null),
      statusCode: state.code,
      nextAction,
      lastSyncedAt: data?.last_synced_at ?? null,
      lastError: state.code === "CONNECTED" || state.code === "NOT_CONFIGURED" ? null : state.message,
    };
  });

export const startGoogleBusinessConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ origin: z.string().url() }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context);
    if (member.role === "member") throw new Error("Only a workspace owner or admin can connect Google.");
    const { assertAllowedOrigin, createGoogleAuthorization, encryptSecret, googleCallbackOrigin, hashValue } = await import("./google-business.server");
    const origin = assertAllowedOrigin(data.origin);
    const callbackOrigin = googleCallbackOrigin(origin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadProviderCredentials } = await import("./integrations/credentials.server");
    const googleCreds = await loadProviderCredentials(supabaseAdmin, member.workspace_id, "google_business");
    const auth = createGoogleAuthorization(`${callbackOrigin}/api/public/google-business/callback`, googleCreds);
    const { error } = await context.supabase.from("google_oauth_states").insert({
      workspace_id: member.workspace_id,
      user_id: context.userId,
      state_hash: hashValue(auth.state),
      code_verifier_ciphertext: await encryptSecret(JSON.stringify({ verifier: auth.verifier, callbackOrigin })),
      redirect_origin: origin,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    if (error) throw error;
    return { authorizationUrl: auth.url };
  });

export const syncGoogleBusinessReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await workspace(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The same sync the scheduler runs; here with the signed-in user's RLS client.
    const { runGoogleReviewSync } = await import("./google-business-sync.server");
    // Same single-flight rule as the scheduler, so a click during an hourly run
    // cannot start a second overlapping sync of the same reviews.
    const { checkSyncSlot } = await import("@/lib/reviews/scheduled-sync.server");
    if ((await checkSyncSlot(supabaseAdmin, member.workspace_id, "google", Date.now())).busy) throw new Error("A Google sync is already running for this workspace. Try again in a few minutes.");
    return runGoogleReviewSync(context.supabase, supabaseAdmin, member.workspace_id, "manual");
  });

export const disconnectGoogleBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await workspace(context);
    if (member.role === "member") throw new Error("Only a workspace owner or admin can disconnect Google.");
    // Revoke at Google first so the stored refresh token stops working there too.
    // A failed revoke does not block the disconnect; the owner can also remove
    // access from their Google account settings.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: stored } = await supabaseAdmin.from("google_business_connections").select("refresh_token_ciphertext").eq("workspace_id", member.workspace_id).maybeSingle();
    if (stored?.refresh_token_ciphertext) {
      try {
        const { decryptSecret } = await import("@/lib/google-business.server");
        await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: await decryptSecret(stored.refresh_token_ciphertext) }), signal: AbortSignal.timeout(20_000) });
      } catch {
        // Revocation is best effort; the local connection is removed below regardless.
      }
    }
    const { error } = await context.supabase.from("google_business_connections").delete().eq("workspace_id", member.workspace_id);
    if (error) throw error;
    await context.supabase.from("connected_platforms").update({ status: "disconnected", account_ref: null }).eq("workspace_id", member.workspace_id).eq("platform", "google");
    return { disconnected: true };
  });

/**
 * Publishes a reply from the review inbox. For a Google Business Profile review
 * with a working connection the reply is posted to Google first and saved only
 * once Google accepted it. Every other platform has no posting API here, so the
 * reply is saved and the caller is told it still has to be copied across.
 */
export const publishReviewReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reviewId: z.string().uuid(), reply: z.string().trim().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }) => {
    const member = await workspace(context);
    const { data: review, error: reviewError } = await context.supabase.from("reviews").select("id, platform, external_id").eq("id", data.reviewId).eq("workspace_id", member.workspace_id).maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) throw new Error("That review no longer exists.");
    let postedToGoogle = false;
    let notPostedReason: string | null = null;
    if (review.platform === "google" && typeof review.external_id === "string" && review.external_id.startsWith("gbp:")) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: connection, error: connectionError } = await supabaseAdmin.from("google_business_connections").select("access_token_ciphertext,refresh_token_ciphertext,token_expires_at,status,scopes").eq("workspace_id", member.workspace_id).maybeSingle();
      if (connectionError) throw connectionError;
      const { usableAccessToken, postGoogleReviewReply, hasBusinessScope, markGoogleConnectionUnusable, GoogleConnectionUnusableError } = await import("./google-business-sync.server");
      if (connection && connection.status === "connected" && hasBusinessScope(connection.scopes)) {
        try {
          const token = await usableAccessToken(supabaseAdmin, member.workspace_id, connection);
          await postGoogleReviewReply(token, review.external_id, data.reply);
          postedToGoogle = true;
        } catch (caught) {
          if (caught instanceof GoogleConnectionUnusableError) await markGoogleConnectionUnusable(supabaseAdmin, member.workspace_id, caught.message);
          throw caught;
        }
      } else {
        notPostedReason = "Google Business Profile is not connected with reply permission.";
      }
    }
    const { error } = await context.supabase.from("reviews").update({ reply: data.reply, replied_at: new Date().toISOString(), replied_by: context.userId, status: "replied", unread: false }).eq("id", review.id).eq("workspace_id", member.workspace_id);
    if (error) throw error;
    // A public reply speaks for the business, so who sent it is kept in the audit trail.
    const { supabaseAdmin: auditClient } = await import("@/integrations/supabase/client.server");
    await auditClient.from("audit_logs").insert({ workspace_id: member.workspace_id, actor: context.userId, action: postedToGoogle ? "review_reply_posted" : "review_reply_saved", target_type: "review", target_id: review.id, metadata: { platform: review.platform, via: "review_center" } });
    return { postedToGoogle, platform: review.platform as string, notPostedReason };
  });
