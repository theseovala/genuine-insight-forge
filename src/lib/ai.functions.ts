// Real AI features for Seovale, served by the Lovable AI Gateway.
import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DraftInput = z.object({
  reviewId: z.string().uuid(),
  instruction: z.string().max(400).optional(),
});

async function runGateway(system: string, prompt: string) {
  const { createGateway, AI_MODEL, REASONING_OPTIONS } = await import("@/lib/ai-gateway.server");
  const { provider } = createGateway();
  const result = streamText({
    model: provider.responses(AI_MODEL),
    system,
    prompt,
    providerOptions: { openai: { ...REASONING_OPTIONS } },
  });
  const text = await result.text;
  return text.trim();
}

/** Writes a reply to a stored review, in the brand's configured tone. */
export const draftReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DraftInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: review, error } = await context.supabase
      .from("reviews")
      .select("author, rating, sentiment, platform, location_name, title, body, tags")
      .eq("id", data.reviewId)
      .maybeSingle();
    if (error) throw error;
    if (!review) throw new Error("That review no longer exists.");

    const { data: brand } = await context.supabase
      .from("brand_settings")
      .select("brand_name, industry, reply_tone, reply_signature")
      .limit(1)
      .maybeSingle();

    const system = [
      `You write public replies to customer reviews on behalf of ${brand?.brand_name ?? "the business"}, a ${brand?.industry ?? "multi-location business"}.`,
      `Tone: ${brand?.reply_tone ?? "warm-professional"}. Sign off as: ${brand?.reply_signature ?? "the customer care team"}.`,
      "Rules: 40-90 words. Address the reviewer by first name. Name the specific issue or praise they raised — never generic filler.",
      "For complaints: apologise once, say what is being done, and offer a direct next step. Never admit legal liability, never promise refunds you cannot confirm, never invent facts or dates.",
      "Return only the reply text, with no quotes, subject line or commentary.",
    ].join("\n");

    const prompt = [
      `Platform: ${review.platform}`,
      `Location: ${review.location_name}`,
      `Reviewer: ${review.author}`,
      `Rating: ${review.rating}/5 (${review.sentiment})`,
      review.title ? `Title: ${review.title}` : "",
      `Review: ${review.body}`,
      review.tags?.length ? `Topics: ${review.tags.join(", ")}` : "",
      data.instruction ? `Extra instruction from the team: ${data.instruction}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return { reply: await runGateway(system, prompt) };
  });

const AnalyzeInput = z.object({
  location: z.string().max(120).optional(),
});

/** Summarises what the stored reviews are saying right now. */
export const analyseFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AnalyzeInput.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("reviews")
      .select("rating, sentiment, platform, location_name, body, tags, external_created_at")
      .order("external_created_at", { ascending: false })
      .limit(120);
    if (data.location && data.location !== "All locations") {
      query = query.eq("location_name", data.location);
    }
    const { data: reviews, error } = await query;
    if (error) throw error;
    if (!reviews || reviews.length === 0) return { insight: "There are no reviews to analyse yet." };

    const system = [
      "You are a reputation analyst. You are given recent customer reviews for a multi-location business.",
      "Write a briefing of at most 180 words with three short labelled sections: What is working, What is hurting us, Do this next.",
      "Cite concrete patterns and counts from the data. No bullet symbols other than '-'. No preamble.",
      "Plain text only: never use markdown headings (#), bold (**) or any other markdown syntax. Write each section label on its own line followed by a colon.",
    ].join("\n");

    const prompt = reviews
      .map(
        (r) =>
          `[${new Date(r.external_created_at).toISOString().slice(0, 10)}] ${r.rating}★ ${r.platform} ${r.location_name} :: ${r.body}`,
      )
      .join("\n");

    return { insight: await runGateway(system, prompt) };
  });

const ReportInput = z.object({
  period: z.string().min(3).max(60),
  scope: z.string().min(1).max(120),
});

/** Generates a written report from stored reviews and saves it. */
export const generateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReportInput.parse(input))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("reviews")
      .select("rating, sentiment, status, platform, location_name, body, external_created_at")
      .order("external_created_at", { ascending: false })
      .limit(300);
    if (data.scope !== "All locations") query = query.eq("location_name", data.scope);
    const { data: reviews, error } = await query;
    if (error) throw error;
    if (!reviews || reviews.length === 0) throw new Error("There is no review data for that scope yet.");

    const total = reviews.length;
    const avg = (reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(2);
    const positive = reviews.filter((r) => r.sentiment === "positive").length;
    const answered = reviews.filter((r) => r.status === "replied").length;

    const system = [
      "You write executive reputation reports. Maximum 220 words.",
      "Structure: one headline sentence, then 'Highlights', 'Risks' and 'Recommended actions', each with 2-3 '-' lines.",
      "Use only the figures supplied. Never invent numbers.",
      "Plain text only: never use markdown headings (#), bold (**) or any other markdown syntax. Write each section label on its own line followed by a colon.",
    ].join("\n");

    const prompt = [
      `Period: ${data.period}`,
      `Scope: ${data.scope}`,
      `Reviews analysed: ${total}`,
      `Average rating: ${avg}`,
      `Positive share: ${Math.round((positive / total) * 100)}%`,
      `Answered: ${Math.round((answered / total) * 100)}%`,
      "Sample of recent reviews:",
      ...reviews.slice(0, 40).map((r) => `${r.rating}★ ${r.location_name} (${r.platform}): ${r.body}`),
    ].join("\n");

    const summary = await runGateway(system, prompt);

    const { data: inserted, error: insertError } = await context.supabase
      .from("reports")
      .insert({
        title: `${data.period} reputation report`,
        period: data.period,
        scope: data.scope,
        summary,
        status: "ready",
        generated_by: context.userId,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    return { id: inserted.id, summary };
  });
