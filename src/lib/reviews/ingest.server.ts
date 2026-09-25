import { priorityFor, sentimentFor, storedBody, type NormalizationResult } from "./normalized";

/**
 * Stores normalized reviews from any provider the same way: one row per
 * (workspace, platform, provider review id), updated in place on re-sync, and
 * one negative-review alert per review. Provider syncs only fetch and
 * normalize; everything after that goes through here.
 *
 * `client` is the caller's Supabase client, so workspace RLS still applies to
 * every write. A row the provider mapping rejected is counted and skipped, never
 * stored with patched-in values.
 */
export async function ingestNormalizedReviews(
  client: any,
  input: {
    workspaceId: string;
    results: NormalizationResult[];
    /** Reviews at or below this rating raise an alert. */
    negativeThreshold: number;
    /** Human name for alert titles, e.g. "Google", "Trustpilot". */
    platformLabel: string;
  },
) {
  let found = 0;
  let created = 0;
  let updated = 0;
  let alerts = 0;
  const rejected: Array<{ reason: string }> = [];

  // Existing rows are looked up once per chunk of provider ids instead of once
  // per review, so a 5,000-review sync makes ~100 lookups rather than 5,000.
  const existingIds = new Map<string, string>();
  const byPlatform = new Map<string, Set<string>>();
  for (const result of input.results) {
    if (!result.ok) continue;
    const ids = byPlatform.get(result.review.platform) ?? new Set<string>();
    ids.add(result.review.externalId);
    byPlatform.set(result.review.platform, ids);
  }
  for (const [platform, ids] of byPlatform) {
    for (const chunk of chunked([...ids], EXTERNAL_ID_CHUNK)) {
      const { data: rows, error: lookupError } = await client
        .from("reviews")
        .select("id, external_id")
        .eq("workspace_id", input.workspaceId)
        .eq("platform", platform)
        .in("external_id", chunk);
      if (lookupError) throw lookupError;
      for (const row of (rows ?? []) as Array<{ id: string; external_id: string }>) {
        existingIds.set(reviewKey(platform, row.external_id), row.id);
      }
    }
  }

  // Negative reviews that need an alert, keyed by stored review id so a review
  // repeated in one batch still raises only one alert.
  const negative = new Map<string, { rating: number; body: string; locationName: string }>();

  for (const result of input.results) {
    if (!result.ok) {
      rejected.push({ reason: result.reason });
      continue;
    }
    const review = result.review;
    found += 1;
    const body = storedBody(review);
    const fields = {
      author: review.author,
      rating: review.rating,
      title: review.title,
      body,
      sentiment: sentimentFor(review.rating),
      priority: priorityFor(review.rating),
      location_name: review.locationName,
      external_created_at: review.createdAt,
      review_url: review.reviewUrl,
      // A reply is only written when the provider returned one; an absent reply
      // never clears a reply already stored.
      // A reply published on the platform since the last sync also marks the
      // review answered, with the time the platform reports.
      ...(review.reply ? { reply: review.reply.text, status: "replied", replied_at: review.reply.publishedAt ?? review.createdAt } : {}),
    };

    const key = reviewKey(review.platform, review.externalId);
    const existingId = existingIds.get(key);

    let storedReviewId: string;
    if (existingId) {
      const { error: updateError } = await client.from("reviews").update(fields).eq("id", existingId);
      if (updateError) throw updateError;
      storedReviewId = existingId;
      updated += 1;
    } else {
      const { data: inserted, error: insertError } = await client
        .from("reviews")
        .insert({
          ...fields,
          workspace_id: input.workspaceId,
          platform: review.platform,
          source: review.source,
          external_id: review.externalId,
          status: review.reply ? "replied" : "pending",
          replied_at: review.reply ? (review.reply.publishedAt ?? review.createdAt) : null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      storedReviewId = inserted.id;
      created += 1;
      // A repeat of the same provider id later in this batch updates this row.
      existingIds.set(key, storedReviewId);
    }

    if (review.rating <= input.negativeThreshold) {
      negative.set(storedReviewId, { rating: review.rating, body, locationName: review.locationName });
    }
  }

  // One alert per negative review: existing alerts are read in chunks, and only
  // reviews without one get a new alert.
  const alerted = new Set<string>();
  for (const chunk of chunked([...negative.keys()], REVIEW_ID_CHUNK)) {
    const { data: rows, error: alertLookupError } = await client
      .from("alerts")
      .select("review_id")
      .eq("workspace_id", input.workspaceId)
      .eq("kind", "negative_review")
      .in("review_id", chunk);
    if (alertLookupError) throw alertLookupError;
    for (const row of (rows ?? []) as Array<{ review_id: string }>) alerted.add(row.review_id);
  }
  for (const [storedReviewId, review] of negative) {
    if (alerted.has(storedReviewId)) continue;
    const { error: alertError } = await client.from("alerts").insert({
      workspace_id: input.workspaceId,
      review_id: storedReviewId,
      kind: "negative_review",
      severity: review.rating === 1 ? "critical" : "high",
      title: `${review.rating}-star ${input.platformLabel} review`,
      detail: (review.body || "Rating only — no written review.").slice(0, 240),
      location_name: review.locationName,
    });
    if (alertError) throw alertError;
    alerts += 1;
  }

  return { found, created, updated, alerts, rejected };
}

/**
 * Ids per `in(...)` lookup. Provider review ids run to ~100 characters, so 50
 * keeps the request URL well inside PostgREST's limits; review uuids are 36.
 */
const EXTERNAL_ID_CHUNK = 50;
const REVIEW_ID_CHUNK = 100;

function reviewKey(platform: string, externalId: string) {
  return `${platform}\u0000${externalId}`;
}

export function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
