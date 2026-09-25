/**
 * Deterministic review-URL derivation.
 *
 * A platform will not act on a report that does not point at the review, so
 * every removal case needs a link. The hard constraint is that a link must
 * never be invented: the Google Business Profile API returns no per-review
 * permalink, so this module never manufactures one. It returns the most precise
 * link that real provider data supports, states which precision that is, and
 * cites the documentation the pattern comes from.
 *
 * Precision levels, most precise first:
 *   review_permalink  the provider itself supplied a link to the single review
 *   location_reviews  a link to the place, derived from a provider-supplied
 *                     place id — the reviewer's entry is on that page
 *   unavailable       provider data does not support any link
 */

export type ReviewUrlPrecision = "review_permalink" | "location_reviews" | "unavailable";

export type ReviewUrlResult = {
  url: string | null;
  precision: ReviewUrlPrecision;
  /** How the value was obtained. Recorded in the evidence package. */
  derivation: "provider_supplied" | "derived_from_place_id" | "stored_link_unclassified" | "none";
  /** Documentation backing the URL pattern. null when no URL was produced. */
  patternSource: string | null;
  /** Present only when no URL could be produced. */
  reason?: "PROVIDER_DATA_UNAVAILABLE";
};

/**
 * Google documents the place-id link format under "Place IDs" in the Places
 * web service documentation. It is the only place link Google publishes as a
 * stable pattern, which is why it is the one used here.
 */
const GOOGLE_PLACE_LINK_DOC =
  "https://developers.google.com/maps/documentation/places/web-service/place-id";

/**
 * Google place ids are opaque, but they are URL-safe base64-ish tokens of
 * meaningful length. Anything shorter or containing a path separator is a
 * resource name such as `accounts/1/locations/2`, not a place id, and must not
 * be pushed into a URL.
 */
function isPlaceId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length >= 10 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function deriveReviewUrl(input: {
  platform: string;
  /** A link the provider itself returned for this single review, when it has one. */
  providerUrl?: string | null;
  /** Provider-supplied place id for the location the review sits on. */
  placeId?: string | null;
}): ReviewUrlResult {
  const provider = typeof input.providerUrl === "string" ? input.providerUrl.trim() : "";
  if (provider.startsWith("https://")) {
    return {
      url: provider,
      precision: "review_permalink",
      derivation: "provider_supplied",
      patternSource: null,
    };
  }

  if (input.platform === "google" && isPlaceId(input.placeId)) {
    return {
      url: `https://www.google.com/maps/place/?q=place_id:${input.placeId}`,
      precision: "location_reviews",
      derivation: "derived_from_place_id",
      patternSource: GOOGLE_PLACE_LINK_DOC,
    };
  }

  return {
    url: null,
    precision: "unavailable",
    derivation: "none",
    patternSource: null,
    reason: "PROVIDER_DATA_UNAVAILABLE",
  };
}

/** The place link `deriveReviewUrl` builds. A listing link, never a review link. */
const GOOGLE_PLACE_LINK = /^https:\/\/www\.google\.com\/maps\/place\/\?q=place_id:([A-Za-z0-9_-]+)$/;

/** Trustpilot's public single-review page, /reviews/<review id>. */
const TRUSTPILOT_REVIEW_PERMALINK = /^https:\/\/(?:[a-z]{2,3}\.)?trustpilot\.com\/reviews\/[A-Za-z0-9]+\/?$/i;

/**
 * Classifies the link stored on a review row at the precision it really has.
 *
 * The Google sync stores the place link in `reviews.review_url`, so a stored
 * URL is not automatically a permalink. A Google place link is recorded at
 * location precision; only a recognised single-review URL is called a
 * permalink; any other stored link is kept but declared at location precision
 * rather than implying it resolves to the one review. With no stored link the
 * place id, when known, feeds the normal derivation.
 */
export function resolveStoredReviewUrl(input: {
  platform: string;
  storedUrl?: string | null;
  placeId?: string | null;
}): ReviewUrlResult {
  const stored = typeof input.storedUrl === "string" ? input.storedUrl.trim() : "";
  if (stored.startsWith("https://")) {
    const place = GOOGLE_PLACE_LINK.exec(stored);
    if (place) {
      const derived = deriveReviewUrl({ platform: "google", placeId: place[1] ?? null });
      if (derived.url) return derived;
    } else if (TRUSTPILOT_REVIEW_PERMALINK.test(stored)) {
      return deriveReviewUrl({ platform: input.platform, providerUrl: stored });
    } else {
      return {
        url: stored,
        precision: "location_reviews",
        derivation: "stored_link_unclassified",
        patternSource: null,
      };
    }
  }
  return deriveReviewUrl({ platform: input.platform, placeId: input.placeId ?? null });
}
