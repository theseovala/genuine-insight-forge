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
    const { googleBusinessState } = await import("./google-business-sync.server");
    const state = googleBusinessState(data);
    return {
      configured: Boolean(process.env["GOOGLE_BUSINESS_CLIENT_ID"] && process.env["GOOGLE_BUSINESS_CLIENT_SECRET"]),
      connected: state.code === "CONNECTED",
      email: data?.google_account_email ?? null,
      status: data && state.code !== "CONNECTED" && data.status === "connected" ? "needs_reconnect" : (data?.status ?? null),
      statusCode: state.code,
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
    const { data: connection, error } = await supabaseAdmin.from("google_business_connections").select("access_token_ciphertext,refresh_token_ciphertext,token_expires_at,status,scopes").eq("workspace_id", member.workspace_id).maybeSingle();
    if (error) throw error;
    // A needs_reconnect row is still tried when it holds the Business Profile
    // scope: an "API not approved" failure clears as soon as Google approves the
    // project, and only a real call can show that.
    if (!connection || connection.status === "revoked") throw new Error("Connect Google Business Profile first.");
    const { fetchGoogleReviews, usableAccessToken, hasBusinessScope, markGoogleConnectionUnusable, GoogleConnectionUnusableError, MISSING_BUSINESS_SCOPE_MESSAGE } = await import("./google-business-sync.server");
    // Without business.manage every Business Profile call returns 403, so the
    // connection is recorded as needing reconnection instead of being tried.
    if (!hasBusinessScope(connection.scopes)) {
      await markGoogleConnectionUnusable(supabaseAdmin, member.workspace_id, MISSING_BUSINESS_SCOPE_MESSAGE);
      throw new Error(MISSING_BUSINESS_SCOPE_MESSAGE);
    }
    const { data: run, error: runError } = await context.supabase.from("sync_runs").insert({ workspace_id: member.workspace_id, platform: "google" }).select("id").single();
    if (runError) throw runError;
    try {
      const token = await usableAccessToken(supabaseAdmin, member.workspace_id, connection);
      const batches = await fetchGoogleReviews(token);
      const { data: rules } = await context.supabase.from("alert_rules").select("negative_rating_threshold").eq("workspace_id", member.workspace_id).maybeSingle();
      // A report the platform will act on has to point at the review. Google
      // publishes no per-review permalink, so this returns the place link when a
      // real place id came back and null otherwise — never a guessed URL.
      const { deriveReviewUrl } = await import("@/lib/removal/review-url");
      let found = 0;
      let created = 0;
      let updated = 0;
      let alerts = 0;
      let rejected = 0;
      for (const batch of batches) {
        const { data: existingLocation } = await context.supabase.from("locations").select("id").eq("workspace_id", member.workspace_id).eq("external_ref", batch.location.externalRef).maybeSingle();
        if (existingLocation) {
          await context.supabase.from("locations").update({ name: batch.location.name, city: batch.location.city, country: batch.location.country }).eq("id", existingLocation.id);
        } else {
          const { error: locationError } = await context.supabase.from("locations").insert({ workspace_id: member.workspace_id, external_ref: batch.location.externalRef, name: batch.location.name, city: batch.location.city, country: batch.location.country });
          if (locationError) throw locationError;
        }
        const reviewUrl = deriveReviewUrl({ platform: "google", placeId: batch.location.placeId }).url;
        const { normalizeGoogleReview } = await import("@/lib/reviews/normalized");
        const { ingestNormalizedReviews } = await import("@/lib/reviews/ingest.server");
        const stored = await ingestNormalizedReviews(context.supabase, {
          workspaceId: member.workspace_id,
          results: batch.reviews.map((review) => normalizeGoogleReview(review, { locationName: batch.location.name, reviewUrl })),
          negativeThreshold: rules?.negative_rating_threshold ?? 2,
          platformLabel: "Google",
        });
        found += stored.found;
        created += stored.created;
        updated += stored.updated;
        alerts += stored.alerts;
        rejected += stored.rejected.length;
      }
      const now = new Date().toISOString();
      await context.supabase.from("sync_runs").update({ status: "completed", locations_found: batches.length, reviews_found: found, reviews_created: created, reviews_updated: updated, alerts_created: alerts, completed_at: now }).eq("id", run.id);
      await supabaseAdmin.from("google_business_connections").update({ status: "connected", last_synced_at: now, last_error: null }).eq("workspace_id", member.workspace_id);
      await context.supabase.from("connected_platforms").update({ status: "connected", last_synced_at: now, last_sync_error: null }).eq("workspace_id", member.workspace_id).eq("platform", "google");
      return { locations: batches.length, reviewsFound: found, reviewsCreated: created, reviewsUpdated: updated, alertsCreated: alerts, reviewsRejected: rejected };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Google sync failed";
      await context.supabase.from("sync_runs").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", run.id);
      if (caught instanceof GoogleConnectionUnusableError) {
        // Scope missing, API not approved or refresh failed: the connection stops
        // being reported as connected until the owner reconnects.
        await markGoogleConnectionUnusable(supabaseAdmin, member.workspace_id, message);
      } else {
        await supabaseAdmin.from("google_business_connections").update({ last_error: message }).eq("workspace_id", member.workspace_id);
      }
      throw caught;
    }
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
