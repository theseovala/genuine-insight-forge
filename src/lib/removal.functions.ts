// Automatic review scanning: checks stored reviews against platform content
// policies with real AI and records removal cases. No sample data is created.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function workspaceIdFor(context: Ctx) {
  const { data, error } = await context.supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", context.userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No workspace is assigned to this account.");
  return data.workspace_id as string;
}

async function memberFor(context: Ctx) {
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

/** Scans reviews that have not been assessed yet and records removal cases. */
export const scanReviewsForRemoval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ limit: z.number().min(1).max(120).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdFor(context);
    const { runRemovalScan } = await import("@/lib/removal-scan.server");

    let limit = data.limit;
    if (!limit) {
      const { data: settings } = await context.supabase
        .from("removal_scan_settings")
        .select("batch_size")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      limit = settings?.batch_size ?? 40;
    }

    const outcome = await runRemovalScan(context.supabase, workspaceId, limit!, context.userId);
    await context.supabase
      .from("removal_scan_settings")
      .update({ last_run_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId);
    return outcome;
  });

/** Reads the automatic scan schedule for the signed-in workspace. */
export const getScanSchedule = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await memberFor(context);
    const { data, error } = await context.supabase
      .from("removal_scan_settings")
      .select("enabled, interval_minutes, batch_size, last_run_at, next_run_at, paused_reason")
      .eq("workspace_id", member.workspace_id)
      .maybeSingle();
    if (error) throw error;
    return {
      canEdit: member.role !== "member",
      enabled: data?.enabled ?? true,
      intervalMinutes: data?.interval_minutes ?? 360,
      batchSize: data?.batch_size ?? 40,
      lastRunAt: data?.last_run_at ?? null,
      nextRunAt: data?.next_run_at ?? null,
      pausedReason: data?.paused_reason ?? null,
    };
  });

/** Updates how often the automatic scan runs and how many reviews it checks. */
export const updateScanSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        enabled: z.boolean().optional(),
        intervalMinutes: z.number().int().min(15).max(10080).optional(),
        batchSize: z.number().int().min(5).max(120).optional(),
        resume: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const member = await memberFor(context);
    if (member.role === "member") throw new Error("Only a workspace owner or admin can change the scan schedule.");

    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.intervalMinutes !== undefined) {
      patch["intervalMinutes"] = undefined;
      patch["interval_minutes"] = data.intervalMinutes;
      patch["next_run_at"] = new Date(Date.now() + data.intervalMinutes * 60_000).toISOString();
      delete patch["intervalMinutes"];
    }
    if (data.batchSize !== undefined) patch["batch_size"] = data.batchSize;
    if (data.resume) patch["paused_reason"] = null;

    const { data: updated, error } = await context.supabase
      .from("removal_scan_settings")
      .upsert({ workspace_id: member.workspace_id, ...patch }, { onConflict: "workspace_id" })
      .select("enabled, interval_minutes, batch_size, next_run_at, paused_reason")
      .single();
    if (error) throw error;
    return {
      enabled: updated.enabled as boolean,
      intervalMinutes: updated.interval_minutes as number,
      batchSize: updated.batch_size as number,
      nextRunAt: updated.next_run_at as string | null,
      pausedReason: updated.paused_reason as string | null,
    };
  });


/** Moves a removal case through its lifecycle. */
export const updateRemovalCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["flagged", "submitted", "approved", "rejected", "dismissed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdFor(context);
    const now = new Date().toISOString();
    const patch = {
      status: data.status,
      ...(data.status === "submitted" ? { submitted_at: now, submitted_by: context.userId } : {}),
      ...(["approved", "rejected", "dismissed"].includes(data.status) ? { resolved_at: now } : {}),
    };
    const { error } = await context.supabase
      .from("removal_cases")
      .update(patch)
      .eq("id", data.id)
      .eq("workspace_id", workspaceId);
    if (error) throw error;
    return { ok: true };
  });

async function caseWithReview(context: Ctx, workspaceId: string, caseId: string) {
  const { data, error } = await context.supabase
    .from("removal_cases")
    .select(
      "id, review_id, violation_type, rationale, appeal_text, reviews(author, rating, body, platform, location_name, external_id)",
    )
    .eq("id", caseId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.reviews) throw new Error("That removal case no longer exists.");
  return data as any;
}

/** Writes the public holding reply that goes out while the removal appeal is pending. */
export const draftRemovalReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ caseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdFor(context);
    const row = await caseWithReview(context, workspaceId, data.caseId);
    const review = row.reviews;

    const { data: brand } = await context.supabase
      .from("brand_settings")
      .select("brand_name, industry, reply_tone, reply_signature")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    const system = [
      `You write public replies to reviews on behalf of ${brand?.brand_name ?? "the business"}, a ${brand?.industry ?? "multi-location business"}.`,
      `Tone: ${brand?.reply_tone ?? "calm-professional"}. Sign off as: ${brand?.reply_signature ?? "the customer care team"}.`,
      "This review appears to break platform content policy and a removal request has been raised with the platform.",
      "Rules: 35-70 words. Stay calm and factual. State politely that the business has no record matching this experience and that the review has been reported to the platform for review.",
      "Never insult the reviewer, never accuse them of lying in harsh terms, never mention internal tools, AI, confidence scores or legal action. Never invent facts.",
      "Return only the reply text, with no quotes or commentary.",
    ].join("\n");

    const prompt = [
      `Platform: ${review.platform}`,
      `Location: ${review.location_name}`,
      `Reviewer: ${review.author}`,
      `Rating: ${review.rating}/5`,
      `Review: ${review.body}`,
      `Policy issue: ${row.violation_type}`,
      `Why: ${row.rationale}`,
    ].join("\n");

    const { runAiText } = await import("@/lib/ai-gateway.server");
    const { output } = await runAiText(system, prompt);
    return { reply: output.trim() };
  });

/**
 * Publishes the reply publicly. When the review came from a connected Google
 * Business Profile the reply is posted to Google; otherwise it is recorded only.
 */
export const publishRemovalReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ caseId: z.string().uuid(), reply: z.string().min(5).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdFor(context);
    const row = await caseWithReview(context, workspaceId, data.caseId);
    const review = row.reviews;
    let postedToGoogle = false;

    if (review.platform === "google" && typeof review.external_id === "string" && review.external_id.startsWith("gbp:")) {
      const { data: connection, error: connectionError } = await context.supabase
        .from("google_business_connections")
        .select("access_token_ciphertext,refresh_token_ciphertext,token_expires_at,status")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection || connection.status !== "connected") {
        throw new Error("Connect Google Business Profile before sending a reply to Google.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { usableAccessToken, postGoogleReviewReply } = await import("./google-business-sync.server");
      const token = await usableAccessToken(supabaseAdmin, workspaceId, connection);
      await postGoogleReviewReply(token, review.external_id, data.reply);
      postedToGoogle = true;
    }

    const now = new Date().toISOString();
    const { error: reviewError } = await context.supabase
      .from("reviews")
      .update({ reply: data.reply, status: "replied", replied_at: now, replied_by: context.userId })
      .eq("id", row.review_id)
      .eq("workspace_id", workspaceId);
    if (reviewError) throw reviewError;

    return { postedToGoogle };
  });
