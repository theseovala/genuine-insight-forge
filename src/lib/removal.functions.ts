// Automatic review scanning: checks stored reviews against platform content
// policies with real AI and records removal cases. No sample data is created.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

const VIOLATIONS = [
  "fake_or_incentivised",
  "spam_or_advertising",
  "hate_or_harassment",
  "profanity_or_obscenity",
  "off_topic",
  "conflict_of_interest",
  "personal_information",
] as const;

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

const SYSTEM = `You assess customer reviews against Google Business Profile and Trustpilot content policies.
Flag a review ONLY when it plainly breaks a policy: fake or incentivised, spam or advertising, hate or harassment,
profanity or obscenity, off-topic (not about the business experience), conflict of interest (competitor or ex-staff),
or exposure of personal information. A genuinely negative but honest review is NOT a violation — never flag it.
Reply with JSON only, no prose and no code fences, in this exact shape:
{"results":[{"id":"<review id>","violation":"<one of ${VIOLATIONS.join("|")}>","confidence":0.0,"rationale":"one or two sentences","appeal":"short factual removal request addressed to the platform"}]}
Return an empty results array when nothing breaks policy.`;

function parseResults(text: string) {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    return results.filter(
      (r: any) => typeof r?.id === "string" && VIOLATIONS.includes(r?.violation),
    ) as Array<{ id: string; violation: string; confidence: number; rationale: string; appeal?: string }>;
  } catch {
    return [];
  }
}

/** Scans reviews that have not been assessed yet and records removal cases. */
export const scanReviewsForRemoval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ limit: z.number().min(1).max(120).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const started = Date.now();
    const workspaceId = await workspaceIdFor(context);

    const { data: existing, error: existingError } = await context.supabase
      .from("removal_cases")
      .select("review_id")
      .eq("workspace_id", workspaceId);
    if (existingError) throw existingError;
    const assessed = new Set((existing ?? []).map((r: any) => r.review_id as string));

    const { data: reviews, error } = await context.supabase
      .from("reviews")
      .select("id, author, rating, body, platform, location_name, external_created_at")
      .eq("workspace_id", workspaceId)
      .order("external_created_at", { ascending: false })
      .limit(400);
    if (error) throw error;

    const pending = ((reviews ?? []) as any[])
      .filter((r) => !assessed.has(r.id) && typeof r.body === "string" && r.body.trim().length > 0)
      .slice(0, data.limit ?? 40);

    if (pending.length === 0) {
      return { checked: 0, flagged: 0 };
    }

    const prompt = pending
      .map(
        (r) =>
          `id: ${r.id}\nplatform: ${r.platform}\nrating: ${r.rating}\nauthor: ${r.author}\nreview: ${String(r.body).slice(0, 700)}`,
      )
      .join("\n---\n");

    try {
      const { runAiText } = await import("@/lib/ai-gateway.server");
      const { output, model } = await runAiText(SYSTEM, prompt);
      const results = parseResults(output).filter((r) => pending.some((p) => p.id === r.id));

      const rows = results.map((r) => ({
        workspace_id: workspaceId,
        review_id: r.id,
        violation_type: r.violation,
        confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0)),
        rationale: String(r.rationale ?? "").slice(0, 1000) || "Flagged by automatic policy scan.",
        appeal_text: r.appeal ? String(r.appeal).slice(0, 2000) : null,
        status: "flagged",
        model,
      }));

      if (rows.length > 0) {
        const { error: insertError } = await context.supabase
          .from("removal_cases")
          .upsert(rows, { onConflict: "workspace_id,review_id", ignoreDuplicates: true });
        if (insertError) throw insertError;
      }

      await context.supabase.from("removal_scans").insert({
        workspace_id: workspaceId,
        started_by: context.userId,
        reviews_checked: pending.length,
        reviews_flagged: rows.length,
        model,
        duration_ms: Date.now() - started,
        status: "completed",
      });

      return { checked: pending.length, flagged: rows.length };
    } catch (scanError) {
      const message = scanError instanceof Error ? scanError.message : "Scan failed";
      await context.supabase.from("removal_scans").insert({
        workspace_id: workspaceId,
        started_by: context.userId,
        reviews_checked: pending.length,
        reviews_flagged: 0,
        duration_ms: Date.now() - started,
        status: "failed",
        error_message: message,
      });
      throw scanError;
    }
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
