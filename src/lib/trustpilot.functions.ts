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
    // The same sync the scheduler runs; here with the signed-in user's RLS client.
    const { runTrustpilotSync } = await import("@/lib/reviews/trustpilot-sync.server");
    // Same single-flight rule as the scheduler, so a click during an hourly run
    // cannot start a second overlapping sync of the same reviews.
    const { checkSyncSlot } = await import("@/lib/reviews/scheduled-sync.server");
    if ((await checkSyncSlot(supabaseAdmin, member.workspace_id, "trustpilot", Date.now())).busy) throw new Error("A Trustpilot sync is already running for this workspace. Try again in a few minutes.");
    return runTrustpilotSync(context.supabase, supabaseAdmin, member.workspace_id, "manual");
  });
