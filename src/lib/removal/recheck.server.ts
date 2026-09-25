/**
 * Automatic recheck: a fresh, real observation of whether a review is still
 * published, made against the provider's own API.
 *
 * The answer is three-valued on purpose. `true` and `false` are observations;
 * `null` means nothing could be observed (no access, an error, an ambiguous
 * status) and it is never read as removal.
 */

export type RecheckObservation = { visible: boolean | null; detail: string };

/**
 * Reads a single-review lookup's HTTP status. 200 means the provider returned
 * the review; 404 means it does not exist any more; anything else (401, 403,
 * 429, 5xx) proves nothing either way.
 */
export function visibilityFromStatus(status: number): boolean | null {
  if (status >= 200 && status < 300) return true;
  if (status === 404) return false;
  return null;
}

/**
 * Looks one Trustpilot review up by id with the workspace's API key, using the
 * public Consumer API "Get a review" endpoint, GET /v1/reviews/{reviewId}.
 */
export async function trustpilotReviewVisible(
  apiKey: string,
  reviewId: string,
  fetcher: typeof fetch = fetch,
): Promise<RecheckObservation> {
  const url = new URL(`https://api.trustpilot.com/v1/reviews/${encodeURIComponent(reviewId)}`);
  url.searchParams.set("apikey", apiKey);
  let response: Response;
  try {
    response = await fetcher(url.toString(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  } catch (caught) {
    // A timeout or network failure observed nothing, which is never removal.
    return {
      visible: null,
      detail: `Trustpilot API GET /v1/reviews/${reviewId} did not answer: ${caught instanceof Error ? caught.message : String(caught)}`,
    };
  }
  const visible = visibilityFromStatus(response.status);
  return {
    visible,
    detail: `Trustpilot API GET /v1/reviews/${reviewId} returned ${response.status}`,
  };
}
