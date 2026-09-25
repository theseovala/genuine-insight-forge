// Per-workspace AI key resolution, kept apart from the AI SDK wiring so it can
// be unit-tested with an in-memory vault.

export interface AiKeys {
  lovable: string | null;
  openai: string | null;
  anthropic: string | null;
}

export type VaultBagLoader = (group: string) => Promise<Record<string, string>>;

/**
 * AI keys for one workspace: the workspace's credential vault first, the server
 * environment as fallback. Read fresh on every call — nothing is cached, so a
 * key removed in Settings stops being used on the next request. LOVABLE_API_KEY
 * is injected by Lovable's runtime and has no vault field, so it is env-only.
 */
export async function resolveAiKeys(workspaceId?: string | null, load?: VaultBagLoader): Promise<AiKeys> {
  const fromVault = async (group: string) => {
    if (!workspaceId) return {} as Record<string, string>;
    try {
      if (load) return await load(group);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { loadProviderCredentials } = await import("@/lib/integrations/credentials.server");
      return await loadProviderCredentials(supabaseAdmin, workspaceId, group);
    } catch {
      // Vault unreadable — the server environment is the only remaining source.
      return {} as Record<string, string>;
    }
  };
  const [openaiBag, anthropicBag] = await Promise.all([fromVault("openai"), fromVault("anthropic")]);
  return {
    lovable: process.env["LOVABLE_API_KEY"] || null,
    openai: openaiBag["OPENAI_API_KEY"] || process.env["OPENAI_API_KEY"] || null,
    anthropic: anthropicBag["ANTHROPIC_API_KEY"] || process.env["ANTHROPIC_API_KEY"] || null,
  };
}
