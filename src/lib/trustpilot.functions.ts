import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function workspace(context: Ctx) {
  const { data, error } = await context.supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", context.userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No workspace is assigned to this account.");
  return data as { workspace_id: string; role: string };
}

/**
 * Pulls real reviews from the Trustpilot Business API using the stored API key
 * and the resolved business unit, then upserts them into the reviews table.
 * Nothing is fabricated: every row comes from the live Trustpilot response.
 */
export const syncTrustpilotReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await workspace(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");

    const creds = await loadProviderCredentials(supabaseAdmin, member.workspace_id, "trustpilot");
    const apiKey = creds["TRUSTPILOT_API_KEY"] ?? process.env["TRUSTPILOT_API_KEY"];
    if (!apiKey) throw new Error("Add your Trustpilot API key in the Integration Manager first.");

    const { data: connection } = await supabaseAdmin
      .from("integration_connections")
      .select("account_ref,account_label,status")
      .eq("workspace_id", member.workspace_id)
      .eq("provider", "trustpilot")
      .maybeSingle();
    if (!connection?.account_ref || connection.status !== "connected") {
      throw new Error("Connect Trustpilot in the Integration Manager first (save the key, set your business domain and verify).");
    }

    const { data: run, error: runError } = await context.supabase
      .from("sync_runs")
      .insert({ workspace_id: member.workspace_id, platform: "trustpilot" })
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
        await supabaseAdmin.from("integration_api_logs").insert({
          workspace_id: member.workspace_id,
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
      }

      const locationName = connection.account_label ?? "Trustpilot";
      const { data: rules } = await context.supabase
        .from("alert_rules")
        .select("negative_rating_threshold")
        .eq("workspace_id", member.workspace_id)
        .maybeSingle();

      // Normalized and stored through the same path as every other provider.
      const { normalizeTrustpilotReview } = await import("@/lib/reviews/normalized");
      const { ingestNormalizedReviews } = await import("@/lib/reviews/ingest.server");
      const stored = await ingestNormalizedReviews(context.supabase, {
        workspaceId: member.workspace_id,
        results: reviews.map((review) => normalizeTrustpilotReview(review, { locationName })),
        negativeThreshold: rules?.negative_rating_threshold ?? 2,
        platformLabel: "Trustpilot",
      });
      const created = stored.created;
      const updated = stored.updated;
      const alerts = stored.alerts;

      const now = new Date().toISOString();
      await context.supabase
        .from("sync_runs")
        .update({ status: "completed", locations_found: 1, reviews_found: stored.found, reviews_created: created, reviews_updated: updated, alerts_created: alerts, completed_at: now })
        .eq("id", run.id);
      await context.supabase
        .from("connected_platforms")
        .update({ status: "connected", last_synced_at: now, last_sync_error: null })
        .eq("workspace_id", member.workspace_id)
        .eq("platform", "trustpilot");
      return { reviewsFound: stored.found, reviewsCreated: created, reviewsUpdated: updated, alertsCreated: alerts, reviewsRejected: stored.rejected.length };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Trustpilot sync failed";
      await context.supabase
        .from("sync_runs")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      await context.supabase
        .from("connected_platforms")
        .update({ last_sync_error: message })
        .eq("workspace_id", member.workspace_id)
        .eq("platform", "trustpilot");
      throw caught;
    }
  });
