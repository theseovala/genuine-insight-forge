import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL } from "@/lib/legal";

/**
 * Writes the consent-trail entry for the data-access disclosure a user accepted
 * immediately before being sent to Google's consent screen. Records which
 * disclosure version and which scopes were shown — never a token or secret.
 */
export async function recordGoogleDisclosureConsent(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string,
  provider: string,
  disclosureVersion: string,
  scopes: string[],
) {
  await admin.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor: userId,
    action: "google_oauth_disclosure_accepted",
    target_type: "integration",
    target_id: provider,
    metadata: { disclosure_version: disclosureVersion, scopes, policy_version: LEGAL.version },
  });
}
