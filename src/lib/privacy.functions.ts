// Privacy requests (access, export, correction, deletion, disconnection) and the
// consent trail. Both are kept in the existing audit_logs table, scoped to the
// workspace, so a request is on record the moment it is made and cannot be
// silently lost. No secrets, tokens or passwords are ever written here.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEGAL } from "@/lib/legal";

export const PRIVACY_REQUEST_TYPES = {
  access: "Get a copy of my personal data",
  export: "Export my workspace data",
  correct: "Correct my personal data",
  delete_account: "Delete my account",
  delete_google_data: "Delete data received from Google",
  delete_workspace: "Delete the whole workspace and its data",
  restrict: "Restrict or object to processing",
  other: "Other privacy question",
} as const;

export type PrivacyRequestType = keyof typeof PRIVACY_REQUEST_TYPES;

const requestTypes = Object.keys(PRIVACY_REQUEST_TYPES) as [
  PrivacyRequestType,
  ...PrivacyRequestType[],
];

async function membership(context: { supabase: SupabaseClient; userId: string }) {
  const { data, error } = await context.supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", context.userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No workspace is assigned to this account.");
  return data as { workspace_id: string; role: "owner" | "admin" | "member" };
}

export const submitPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ type: z.enum(requestTypes), details: z.string().trim().max(2000).default("") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const member = await membership(context);
    if (data.type === "delete_workspace" && member.role !== "owner") {
      throw new Error("Only the workspace owner can request deletion of the whole workspace.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const reference = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      workspace_id: member.workspace_id,
      actor: context.userId,
      action: "privacy_request_submitted",
      target_type: "privacy_request",
      target_id: reference,
      metadata: {
        type: data.type,
        details: data.details,
        role: member.role,
        requester_email: user?.user?.email ?? null,
        policy_version: LEGAL.version,
        status: "received",
      },
    });
    if (error) throw new Error("Your request could not be recorded. Please try again.");
    return { reference };
  });

export const listPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await membership(context);
    // Owners and admins see every request in the workspace; members see their own.
    let query = context.supabase
      .from("audit_logs")
      .select("target_id, actor, metadata, created_at")
      .eq("workspace_id", member.workspace_id)
      .eq("action", "privacy_request_submitted")
      .order("created_at", { ascending: false })
      .limit(50);
    if (member.role === "member") query = query.eq("actor", context.userId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        reference: row.target_id as string,
        type: (typeof meta["type"] === "string" ? meta["type"] : "other") as PrivacyRequestType,
        details: typeof meta["details"] === "string" ? meta["details"] : "",
        status: typeof meta["status"] === "string" ? meta["status"] : "received",
        mine: row.actor === context.userId,
        createdAt: row.created_at as string,
      };
    });
  });

/** The signed-in user's recorded agreement to the Terms and Privacy Policy. */
export const getConsentRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    return {
      acceptedAt: typeof meta["terms_accepted_at"] === "string" ? meta["terms_accepted_at"] : null,
      acceptedVersion: typeof meta["terms_version"] === "string" ? meta["terms_version"] : null,
      currentVersion: LEGAL.version,
    };
  });

/** Records that the signed-in user accepted the current Terms and Privacy Policy. */
export const acceptCurrentTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const member = await membership(context);
    const acceptedAt = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: {
        ...(existing?.user?.user_metadata ?? {}),
        terms_accepted_at: acceptedAt,
        terms_version: LEGAL.version,
      },
    });
    if (error) throw new Error("Your acceptance could not be recorded. Please try again.");
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: member.workspace_id,
      actor: context.userId,
      action: "legal_terms_accepted",
      target_type: "legal_document",
      target_id: LEGAL.version,
      metadata: { documents: ["terms", "privacy"], via: "settings" },
    });
    return { acceptedAt, acceptedVersion: LEGAL.version };
  });
