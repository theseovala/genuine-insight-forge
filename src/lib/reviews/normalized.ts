/**
 * The one shape every review provider hands to the rest of the product.
 *
 * Google, Trustpilot and any future provider map their own API payload into a
 * NormalizedReview here; storage, alerts, AI classification, evidence and the
 * removal lifecycle only ever see this shape. Nothing in this module invents a
 * value: a field the provider did not return stays null or empty, and a row
 * that cannot be identified or rated is rejected rather than patched up.
 */

export type NormalizedReview = {
  /** Platform key stored on reviews.platform, e.g. "google", "trustpilot". */
  platform: string;
  /** Integration that produced the row, stored on reviews.source. */
  source: string;
  /** The provider's own id for this review. Required: it is the dedupe key. */
  externalId: string;
  author: string;
  /** Whole stars, 1–5. */
  rating: number;
  title: string | null;
  /** The reviewer's own words. Empty when the provider returned a rating only. */
  body: string;
  /** ISO timestamp the provider says the review was written. */
  createdAt: string;
  locationName: string;
  /** A link the provider returned, or a documented derivation. Never guessed. */
  reviewUrl: string | null;
  /** The business's public reply, when the provider returned one. */
  reply: { text: string; publishedAt: string | null } | null;
};

export type NormalizationResult = { ok: true; review: NormalizedReview } | { ok: false; reason: string };

export function sentimentFor(rating: number) {
  return rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
}

export function priorityFor(rating: number) {
  return rating <= 2 ? "high" : rating === 3 ? "medium" : "low";
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function isoOrNull(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** Checks the invariants every provider mapping must satisfy. */
export function validateNormalized(review: NormalizedReview): NormalizationResult {
  if (!review.platform) return { ok: false, reason: "platform missing" };
  if (!review.externalId) return { ok: false, reason: "provider review id missing" };
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
    return { ok: false, reason: `rating ${String(review.rating)} is not 1–5` };
  }
  if (!isoOrNull(review.createdAt)) return { ok: false, reason: "review date missing or invalid" };
  if (review.reviewUrl !== null && !review.reviewUrl.startsWith("https://")) {
    return { ok: false, reason: "review link is not https" };
  }
  return { ok: true, review };
}

/**
 * Google Business Profile review, as mapped by google-business-sync.server.ts
 * from the v4 reviews API. `reviewUrl` is the place link the sync derived from
 * a provider-supplied place id, or null.
 */
export function normalizeGoogleReview(
  review: { id: string; author: string; rating: number; body: string; createdAt: string; reply?: { text: string; publishedAt: string | null } | null },
  context: { locationName: string; reviewUrl: string | null },
): NormalizationResult {
  return validateNormalized({
    platform: "google",
    source: "google_business",
    externalId: text(review.id),
    author: text(review.author) || "Google user",
    rating: review.rating,
    title: null,
    body: text(review.body),
    createdAt: review.createdAt,
    locationName: context.locationName,
    reviewUrl: context.reviewUrl,
    reply: review.reply && text(review.reply.text) ? { text: text(review.reply.text), publishedAt: isoOrNull(review.reply.publishedAt) } : null,
  });
}

/**
 * Trustpilot review object from GET /v1/business-units/{id}/reviews. Only a
 * public trustpilot.com link present in the payload's own `links` is used as
 * the review URL; none is constructed.
 */
export function normalizeTrustpilotReview(raw: Record<string, any>, context: { locationName: string }): NormalizationResult {
  const links: Array<Record<string, unknown>> = Array.isArray(raw?.["links"]) ? raw["links"] : [];
  const publicLink = links
    .map((link) => text(link?.["href"]))
    .find((href) => /^https:\/\/(?:[a-z]{2,3}\.)?trustpilot\.com\/reviews\//i.test(href));
  const replyText = text(raw?.["reply"]?.["message"]);
  return validateNormalized({
    platform: "trustpilot",
    source: "trustpilot",
    externalId: raw?.["id"] === undefined || raw?.["id"] === null ? "" : String(raw["id"]).trim(),
    author: text(raw?.["consumer"]?.["displayName"]) || "Trustpilot reviewer",
    rating: typeof raw?.["stars"] === "number" ? raw["stars"] : 0,
    title: text(raw?.["title"]) || null,
    body: text(raw?.["text"]),
    createdAt: text(raw?.["createdAt"]),
    locationName: context.locationName,
    reviewUrl: publicLink ?? null,
    reply: replyText ? { text: replyText, publishedAt: isoOrNull(raw?.["reply"]?.["publishedAt"]) } : null,
  });
}

/** Stored review text: the title and body together, the form the classifier reads. */
export function storedBody(review: NormalizedReview) {
  return [review.title, review.body].filter((part) => part && part.trim()).join(" — ");
}
