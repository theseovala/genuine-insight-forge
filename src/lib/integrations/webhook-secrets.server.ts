// Webhook secrets (Meta app secret, X consumer secret, Trustpilot signing
// secret, Meta/WhatsApp verify tokens) from the credential vault, with the
// server environment as fallback.
//
// A webhook delivery names no workspace until its payload is parsed, so every
// workspace's stored secret for the field is a candidate. A match only proves
// which workspace's secret signed the body: the caller must then check that the
// workspace the payload resolves to is one whose secret matched (or that the
// server-level secret matched), so one workspace's secret can never
// authenticate an event for another workspace's account.
import { timingSafeEqual } from "crypto";

export type VaultField = { group: string; field: string };
export type VaultFieldReader = (group: string, field: string) => Promise<{ workspaceId: string; secret: string }[]>;

export interface SecretMatch {
  /** At least one secret (env or vault) exists for this webhook. */
  configured: boolean;
  /** The server-environment secret matched. */
  env: boolean;
  /** Workspaces whose stored secret matched. */
  workspaceIds: string[];
}

/** Reads one field for every workspace. Values that cannot be decrypted are skipped, never trusted. */
export async function readVaultField(group: string, field: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { decryptValue } = await import("./crypto.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("integration_provider_credentials")
    .select("workspace_id,value_ciphertext")
    .eq("provider", group)
    .eq("field_key", field);
  if (error) throw error;
  const out: { workspaceId: string; secret: string }[] = [];
  for (const row of (data ?? []) as { workspace_id: string; value_ciphertext: string }[]) {
    try {
      out.push({ workspaceId: row.workspace_id, secret: await decryptValue(row.value_ciphertext) });
    } catch {
      // Undecryptable value: treated as missing.
    }
  }
  return out;
}

/** Constant-time string equality (length leak only). */
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/**
 * Tests `matches` against the server-environment secrets first; only when none
 * of them matches are the workspace vault values consulted.
 */
export async function matchWebhookSecret(
  envNames: string[],
  vaultFields: VaultField[],
  matches: (secret: string) => boolean,
  read: VaultFieldReader = readVaultField,
): Promise<SecretMatch> {
  const envSecrets = envNames.map((name) => process.env[name]).filter((value): value is string => Boolean(value));
  if (envSecrets.some((secret) => matches(secret))) return { configured: true, env: true, workspaceIds: [] };
  let configured = envSecrets.length > 0;
  const workspaceIds: string[] = [];
  for (const { group, field } of vaultFields) {
    let stored: { workspaceId: string; secret: string }[] = [];
    try {
      stored = await read(group, field);
    } catch {
      // Vault unreadable: only the environment could have authenticated this delivery.
      continue;
    }
    for (const { workspaceId, secret } of stored) {
      if (!secret) continue;
      configured = true;
      if (matches(secret) && !workspaceIds.includes(workspaceId)) workspaceIds.push(workspaceId);
    }
  }
  return { configured, env: false, workspaceIds };
}

/** True when the matched secret is allowed to speak for `workspaceId`. */
export function secretCoversWorkspace(match: SecretMatch, workspaceId: string | null) {
  if (match.env) return true;
  return workspaceId !== null && match.workspaceIds.includes(workspaceId);
}
