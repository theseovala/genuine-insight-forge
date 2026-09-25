/**
 * Trustpilot review sync for one workspace, shared by the manual sync button
 * (the signed-in user's RLS client) and the hourly scheduler (the service-role
 * client). The service-role client is not restricted by RLS, so every read and
 * write here is filtered by `workspaceId` explicitly.
 *
 * Pulls real reviews from the Trustpilot Business API using the stored API key
 * and the resolved business unit. Nothing is fabricated: every row comes from
 * the live Trustpilot response, and nothing stored is deleted.
 */

export type ReviewSyncTrigger = "manual" | "scheduled";

/** The workspace's Trustpilot API key, or the deployment-wide one, or null. Never logged. */
export async function trustpilotApiKey(admin: any, workspaceId: string): Promise<string | null> {
  const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");
  const creds = await loadProviderCredentials(admin, workspaceId, "trustpilot");
  return creds["TRUSTPILOT_API_KEY"] ?? process.env["TRUSTPILOT_API_KEY"] ?? null;
}

export async function runTrustpilotSync(client: any, admin: any, workspaceId: string, trigger: ReviewSyncTrigger) {
  const apiKey = await trustpilotApiKey(admin, workspaceId);
  if (!apiKey) throw new Error("Add your Trustpilot API key in the Integration Manager first.");

  const { data: connection } = await admin
    .from("integration_connections")
    .select("account_ref,account_label,status")
    .eq("workspace_id", workspaceId)
    .eq("provider", "trustpilot")
    .maybeSingle();
  if (!connection?.account_ref || connection.status !== "connected") {
    throw new Error("Connect Trustpilot in the Integration Manager first (save the key, set your business domain and verify).");
  }

  const { data: run, error: runError } = await client
    .from("sync_runs")
    .insert({ workspace_id: workspaceId, platform: "trustpilot" })
    .select("id")
    .single();
  if (runError) throw runError;

  try {
    // Every page is read, not just the first: a page shorter than perPage, an
    // empty page or a missing "next-page" link ends the walk, and MAX_PAGES
    // bounds one sync (100 x 50 = 5,000 reviews).
    const PER_PAGE = 100;
    const MAX_PAGES = 50;
    const reviews: any[] = [];
    let truncated = false;
    const { outcomeFor } = await import("@/lib/integrations/providers.server");
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const startedAt = Date.now();
      const url = new URL(`https://api.trustpilot.com/v1/business-units/${encodeURIComponent(connection.account_ref)}/reviews`);
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("perPage", String(PER_PAGE));
      url.searchParams.set("page", String(page));
      // Bounded, so one hung page fails this sync (recorded below) instead of hanging it.
      const response = await fetch(url.toString(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
      const payload = await response.json().catch(() => ({}));
      await admin.from("integration_api_logs").insert({
        workspace_id: workspaceId,
        provider: "trustpilot",
        operation: "reviews_sync",
        method: "GET",
        endpoint: "/v1/business-units/{id}/reviews",
        http_status: response.status,
        duration_ms: Date.now() - startedAt,
        outcome_code: outcomeFor(response.ok, response.status, String(payload?.message ?? "")),
        error_message: response.ok ? null : (payload?.message ?? `Trustpilot returned HTTP ${response.status}`),
      });
      if (!response.ok) {
        throw new Error(payload?.message ?? `Trustpilot sync failed with HTTP ${response.status}.`);
      }
      const pageReviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
      reviews.push(...pageReviews);
      const hasNext = Array.isArray(payload?.links) ? payload.links.some((link: any) => link?.rel === "next-page") : pageReviews.length === PER_PAGE;
      if (pageReviews.length === 0 || pageReviews.length < PER_PAGE || !hasNext) break;
      // The last allowed page was full and Trustpilot says there is more.
      if (page === MAX_PAGES) truncated = true;
    }

    const locationName = connection.account_label ?? "Trustpilot";
    const { data: rules } = await client
      .from("alert_rules")
      .select("negative_rating_threshold")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    // Normalized and stored through the same path as every other provider.
    const { normalizeTrustpilotReview } = await import("@/lib/reviews/normalized");
    const { ingestNormalizedReviews } = await import("@/lib/reviews/ingest.server");
    const stored = await ingestNormalizedReviews(client, {
      workspaceId,
      results: reviews.map((review) => normalizeTrustpilotReview(review, { locationName })),
      negativeThreshold: rules?.negative_rating_threshold ?? 2,
      platformLabel: "Trustpilot",
    });
    const created = stored.created;
    const updated = stored.updated;
    const alerts = stored.alerts;
    const notices = truncated ? [`Only the first ${PER_PAGE * MAX_PAGES} Trustpilot reviews were read; Trustpilot reported more.`] : [];

    const now = new Date().toISOString();
    await client
      .from("sync_runs")
      .update({ status: "completed", locations_found: 1, reviews_found: stored.found, reviews_created: created, reviews_updated: updated, alerts_created: alerts, error_message: notices.length ? notices.join(" ") : null, completed_at: now })
      .eq("id", run.id)
      .eq("workspace_id", workspaceId);
    await client
      .from("connected_platforms")
      .update({ status: "connected", last_synced_at: now, last_sync_error: null })
      .eq("workspace_id", workspaceId)
      .eq("platform", "trustpilot");
    return { reviewsFound: stored.found, reviewsCreated: created, reviewsUpdated: updated, alertsCreated: alerts, reviewsRejected: stored.rejected.length, notices, trigger };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Trustpilot sync failed";
    await client
      .from("sync_runs")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("workspace_id", workspaceId);
    await client
      .from("connected_platforms")
      .update({ last_sync_error: message })
      .eq("workspace_id", workspaceId)
      .eq("platform", "trustpilot");
    throw caught;
  }
}
