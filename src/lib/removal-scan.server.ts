// Shared review-removal scan engine. Used by the manual scan (server function)
// and by the scheduled scan route. Works with any Supabase client instance.
export const VIOLATIONS = [
  "fake_or_incentivised",
  "spam_or_advertising",
  "hate_or_harassment",
  "profanity_or_obscenity",
  "off_topic",
  "conflict_of_interest",
  "personal_information",
] as const;

export const SCAN_SYSTEM = `You assess customer reviews against Google Business Profile and Trustpilot content policies.
Flag a review ONLY when it plainly breaks a policy: fake or incentivised, spam or advertising, hate or harassment,
profanity or obscenity, off-topic (not about the business experience), conflict of interest (competitor or ex-staff),
or exposure of personal information. A genuinely negative but honest review is NOT a violation — never flag it.
Reply with JSON only, no prose and no code fences, in this exact shape:
{"results":[{"id":"<review id>","violation":"<one of ${VIOLATIONS.join("|")}>","confidence":0.0,"rationale":"one or two sentences","appeal":"short factual removal request addressed to the platform"}]}
Return an empty results array when nothing breaks policy.`;

export function parseScanResults(text: string) {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    return results.filter(
      (r: any) => typeof r?.id === "string" && (VIOLATIONS as readonly string[]).includes(r?.violation),
    ) as Array<{ id: string; violation: string; confidence: number; rationale: string; appeal?: string }>;
  } catch {
    return [];
  }
}

/**
 * Scans up to `limit` not-yet-assessed reviews of one workspace and records
 * removal cases plus a scan history row. Returns real counts only.
 */
export async function runRemovalScan(
  client: any,
  workspaceId: string,
  limit: number,
  startedBy: string | null,
) {
  const started = Date.now();

  const { data: existing, error: existingError } = await client
    .from("removal_cases")
    .select("review_id")
    .eq("workspace_id", workspaceId);
  if (existingError) throw existingError;
  const assessed = new Set((existing ?? []).map((r: any) => r.review_id as string));

  const { data: reviews, error } = await client
    .from("reviews")
    .select("id, author, rating, body, platform, location_name, external_created_at")
    .eq("workspace_id", workspaceId)
    .neq("source", "seed")
    .order("external_created_at", { ascending: false })
    .limit(400);
  if (error) throw error;

  const pending = ((reviews ?? []) as any[])
    .filter((r) => !assessed.has(r.id) && typeof r.body === "string" && r.body.trim().length > 0)
    .slice(0, limit);

  if (pending.length === 0) return { checked: 0, flagged: 0 };

  const prompt = pending
    .map(
      (r) =>
        `id: ${r.id}\nplatform: ${r.platform}\nrating: ${r.rating}\nauthor: ${r.author}\nreview: ${String(r.body).slice(0, 700)}`,
    )
    .join("\n---\n");

  try {
    const { runAiText } = await import("@/lib/ai-gateway.server");
    const { output, model } = await runAiText(SCAN_SYSTEM, prompt);
    const results = parseScanResults(output).filter((r) => pending.some((p) => p.id === r.id));

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
      const { error: insertError } = await client
        .from("removal_cases")
        .upsert(rows, { onConflict: "workspace_id,review_id", ignoreDuplicates: true });
      if (insertError) throw insertError;
    }

    await client.from("removal_scans").insert({
      workspace_id: workspaceId,
      started_by: startedBy,
      reviews_checked: pending.length,
      reviews_flagged: rows.length,
      model,
      duration_ms: Date.now() - started,
      status: "completed",
    });

    return { checked: pending.length, flagged: rows.length };
  } catch (scanError) {
    const message = scanError instanceof Error ? scanError.message : "Scan failed";
    await client.from("removal_scans").insert({
      workspace_id: workspaceId,
      started_by: startedBy,
      reviews_checked: pending.length,
      reviews_flagged: 0,
      duration_ms: Date.now() - started,
      status: "failed",
      error_message: message,
    });
    throw scanError;
  }
}
