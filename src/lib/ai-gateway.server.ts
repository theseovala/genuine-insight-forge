// Server-only helper that connects the AI SDK to the Lovable AI Gateway.
import { createOpenAI } from "@ai-sdk/openai";

export const AI_MODEL = "openai/gpt-6-astra";

/** Captures and resends the gateway run id for the lifetime of one request. */
export function createLovableAiGatewayRunIdFetch(initialRunId?: string | undefined) {
  let runId = initialRunId;
  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
    const res = await fetch(input, { ...init, headers });
    const returned = res.headers.get("X-Lovable-AIG-Run-ID");
    if (returned) runId = returned;
    return res;
  };
  return {
    fetch: wrapped,
    get runId() {
      return runId;
    },
  };
}

/** Creates the Responses-API provider bound to the Lovable AI Gateway. */
export function createGateway() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project.");
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });
  return { provider, runIdFetch };
}

export const REASONING_OPTIONS = {
  forceReasoning: true,
  reasoningEffort: "low",
  reasoningSummary: "auto",
  store: false,
  include: ["reasoning.encrypted_content"],
} as const;

/** Model used when falling back to the account's own OpenAI key. */
export const FALLBACK_MODEL = "gpt-4.1";

/**
 * Direct OpenAI provider built from the project's own OPENAI_API_KEY.
 * Used only as a backup when the Lovable AI Gateway call fails.
 */
export function createDirectOpenAI() {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) return null;
  return createOpenAI({ apiKey: key });
}
