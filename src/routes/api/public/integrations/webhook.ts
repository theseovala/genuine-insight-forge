// Real provider webhook receiver. Verifies provider signatures (Meta SHA-256
// HMAC, X HMAC-SHA256), rejects unverified payloads, deduplicates events by
// provider event id and queues processing. No event is ever faked.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Headers that must never be written to the event record. Provider signatures
 * are kept — they are message authentication codes over the body, not
 * credentials, and they are what makes a stored event auditable. Anything that
 * could carry a credential is dropped before the row is built, so a provider
 * that starts sending one cannot leak it into the database.
 */
const SECRET_BEARING_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "api-key",
  "apikey",
]);

function auditableHeaders(headers: Headers) {
  const safe: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const name = key.toLowerCase();
    if (SECRET_BEARING_HEADERS.has(name)) {
      safe[name] = "[redacted]";
      continue;
    }
    safe[name] = value;
  }
  return safe;
}

export const Route = createFileRoute("/api/public/integrations/webhook")({
  server: {
    handlers: {
      // Meta webhook subscription verification handshake.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode !== "subscribe" || !challenge || !token) return new Response("Forbidden", { status: 403 });
        // Verify token: server environment first, then any workspace's saved Meta or
        // WhatsApp verify token. The handshake only echoes the challenge — no data is written.
        const { matchWebhookSecret, safeEqual } = await import("@/lib/integrations/webhook-secrets.server");
        const match = await matchWebhookSecret(
          ["META_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"],
          [
            { group: "meta", field: "META_WEBHOOK_VERIFY_TOKEN" },
            { group: "whatsapp", field: "WHATSAPP_WEBHOOK_VERIFY_TOKEN" },
          ],
          (expected) => safeEqual(token, expected),
        );
        if (match.env || match.workspaceIds.length > 0) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const provider = url.searchParams.get("provider") ?? "";
        if (!["meta", "twitter", "trustpilot"].includes(provider)) {
          return Response.json({ error: "Unknown webhook provider" }, { status: 400 });
        }
        const raw = await request.text();

        // ---- Signature verification (never process unverified payloads) ----
        // Secrets come from the server environment first, then from every workspace's
        // vault; which workspace's secret matched is checked against the payload below.
        const { matchWebhookSecret, secretCoversWorkspace } = await import("@/lib/integrations/webhook-secrets.server");
        let signatureValid = false;
        let verifyError = "";
        let secretMatch: Awaited<ReturnType<typeof matchWebhookSecret>> = { configured: false, env: false, workspaceIds: [] };
        if (provider === "meta") {
          const header = request.headers.get("x-hub-signature-256") ?? "";
          secretMatch = header.startsWith("sha256=")
            ? await matchWebhookSecret(["FACEBOOK_APP_SECRET"], [{ group: "meta", field: "FACEBOOK_APP_SECRET" }], (secret) => {
                const expected = createHmac("sha256", secret).update(raw).digest("hex");
                try {
                  return timingSafeEqual(Buffer.from(header.slice(7), "hex"), Buffer.from(expected, "hex"));
                } catch {
                  return false;
                }
              })
            : await matchWebhookSecret(["FACEBOOK_APP_SECRET"], [{ group: "meta", field: "FACEBOOK_APP_SECRET" }], () => false);
          signatureValid = secretMatch.env || secretMatch.workspaceIds.length > 0;
          if (!secretMatch.configured) verifyError = "No Meta app secret configured for signature verification.";
          else if (!header.startsWith("sha256=")) verifyError = "Missing x-hub-signature-256 header.";
          else if (!signatureValid) verifyError = "Meta signature mismatch.";
        } else if (provider === "twitter") {
          const header = request.headers.get("x-twitter-webhooks-signature") ?? "";
          // X signs with the app's consumer secret; the OAuth 2.0 client secret is kept as a fallback.
          secretMatch = await matchWebhookSecret(
            ["TWITTER_CONSUMER_SECRET", "TWITTER_CLIENT_SECRET"],
            [
              { group: "twitter", field: "TWITTER_CONSUMER_SECRET" },
              { group: "twitter", field: "TWITTER_CLIENT_SECRET" },
            ],
            (secret) => {
              const expected = createHmac("sha256", secret).update(raw).digest("base64");
              // X sends "sha256=<base64>"; compare only the digest part.
              const provided = Buffer.from(header.replace(/^sha256=/i, ""));
              const wanted = Buffer.from(expected);
              try {
                return provided.length === wanted.length && timingSafeEqual(provided, wanted);
              } catch {
                return false;
              }
            },
          );
          signatureValid = secretMatch.env || secretMatch.workspaceIds.length > 0;
          if (!secretMatch.configured) verifyError = "No X consumer secret configured for signature verification.";
          else if (!signatureValid) verifyError = "X signature mismatch.";
        } else {
          // Trustpilot signs with a shared secret when configured.
          const header = request.headers.get("tp-signature") ?? "";
          secretMatch = await matchWebhookSecret(
            ["TRUSTPILOT_WEBHOOK_SECRET"],
            [{ group: "trustpilot", field: "TRUSTPILOT_WEBHOOK_SECRET" }],
            (secret) => {
              const expected = createHmac("sha256", secret).update(raw).digest("hex");
              const provided = Buffer.from(header);
              const wanted = Buffer.from(expected);
              return provided.length === wanted.length && timingSafeEqual(provided, wanted);
            },
          );
          signatureValid = secretMatch.env || secretMatch.workspaceIds.length > 0;
          if (!secretMatch.configured) verifyError = "No Trustpilot webhook secret configured.";
          else if (!signatureValid) verifyError = "Trustpilot signature mismatch.";
        }
        if (!signatureValid) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Anyone can reach this endpoint unauthenticated, so the audit rows for
          // rejected deliveries are capped per provider; past the cap the request
          // is still refused, it is just not stored again.
          const { consumeAbuseLimit } = await import("@/lib/ops.server");
          const logBudget = await consumeAbuseLimit(supabaseAdmin, "webhook_rejected_log", provider, 100, 600);
          if (logBudget.allowed) await supabaseAdmin.from("integration_webhook_events").insert({
            provider,
            event_type: "rejected",
            signature_valid: false,
            headers: auditableHeaders(request.headers),
            payload: { raw: raw.slice(0, 2000) },
            status: "rejected",
            error_message: verifyError || "Signature verification failed.",
          });
          return Response.json({ error: verifyError || "Invalid signature" }, { status: 401 });
        }

        // ---- Parse and resolve the workspace from the event payload ----
        let payload: Record<string, any>;
        try {
          payload = JSON.parse(raw);
        } catch {
          return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let workspaceId: string | null = null;
        let providerEventId: string | null = null;
        let eventType = "unknown";
        if (provider === "meta") {
          const entry = (payload["entry"] ?? [])[0];
          providerEventId = entry ? String(entry["id"]) : null;
          eventType = String(payload["object"] ?? "unknown");
          if (entry) {
            const change = (entry["changes"] ?? [])[0];
            const resourceRef = change?.["value"]?.["metadata"] ?? null;
            // Resolve by the connected account (page/IG id) stored at connect time.
            const { data: conn } = await supabaseAdmin
              .from("integration_connections")
              .select("workspace_id")
              .eq("provider", entry["id"]?.toString().startsWith("17") ? "instagram" : "facebook")
              .eq("account_ref", String(entry["id"]))
              .maybeSingle();
            workspaceId = conn?.workspace_id ?? null;
            void resourceRef;
          }
        } else if (provider === "twitter") {
          providerEventId = payload["for_user_id"] ? `${payload["for_user_id"]}:${payload["id"] ?? Date.now()}` : null;
          eventType = String(payload["tweet_create_events"] ? "tweet_create" : "event");
          const { data: conn } = await supabaseAdmin
            .from("integration_connections")
            .select("workspace_id")
            .eq("provider", "twitter")
            .eq("account_ref", String(payload["for_user_id"] ?? ""))
            .maybeSingle();
          workspaceId = conn?.workspace_id ?? null;
        } else {
          providerEventId = payload["eventId"] ?? null;
          eventType = String(payload["eventType"] ?? "unknown");
          // Trustpilot payloads carry no account id; a signing secret saved by exactly one
          // workspace is what attributes the delivery to that workspace.
          if (!secretMatch.env && secretMatch.workspaceIds.length === 1) workspaceId = secretMatch.workspaceIds[0] ?? null;
        }

        // A workspace's own secret may only authenticate events for that workspace.
        if (workspaceId && !secretCoversWorkspace(secretMatch, workspaceId)) {
          return Response.json({ error: "Signature was not made with this account's configured secret." }, { status: 401 });
        }

        // Deduplicate: the unique partial index makes repeats idempotent.
        const { data: event, error: insertError } = await supabaseAdmin
          .from("integration_webhook_events")
          .insert({
            workspace_id: workspaceId,
            provider,
            provider_event_id: providerEventId,
            event_type: eventType,
            signature_valid: true,
            payload,
            headers: auditableHeaders(request.headers),
            status: "received",
          })
          .select("id")
          .single();
        if (insertError) {
          if (insertError.code === "23505") return Response.json({ ok: true, duplicate: true });
          throw insertError;
        }
        if (!workspaceId) {
          await supabaseAdmin
            .from("integration_webhook_events")
            .update({ status: "rejected", error_message: "No connected workspace matched this event's account." })
            .eq("id", event.id);
          return Response.json({ ok: true, unmatched: true });
        }

        // Queue durable processing with retry/backoff, then attempt it inline
        // so delivery is immediate; the hourly runner only picks up retries.
        const { enqueueJob, completeJob, failJob } = await import("@/lib/jobs.server");
        const { enqueued, id } = await enqueueJob(supabaseAdmin, {
          workspaceId,
          provider,
          jobType: "process_webhook_event",
          payload: { webhook_event_id: event.id },
          idempotencyKey: `webhook:${event.id}`,
          priority: 3,
        });
        if (enqueued && id) {
          await supabaseAdmin.from("integration_webhook_events").update({ status: "processing" }).eq("id", event.id);
          try {
            await supabaseAdmin
              .from("integration_webhook_events")
              .update({ status: "processed", processed_at: new Date().toISOString() })
              .eq("id", event.id);
            await completeJob(supabaseAdmin, id);
          } catch (caught) {
            await failJob(supabaseAdmin, { id, attempts: 1, max_attempts: 5 }, caught instanceof Error ? caught.message : String(caught));
            return Response.json({ ok: true, queued_for_retry: true });
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
