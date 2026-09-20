// Job runner endpoint: executes due integration jobs (webhook processing etc.)
// with lease + retry/backoff from the durable queue. Called by pg_cron with a
// scheduler token or LOVABLE_CRON_SECRET. Never processes anything fake.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/integrations/jobs-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const expected = process.env["LOVABLE_CRON_SECRET"];
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (expected) {
          const token = auth.replace(/^Bearer\s+/i, "");
          const ok =
            (token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected))) ||
            (await (async () => {
              const { data } = await supabaseAdmin
                .from("scheduler_tokens")
                .select("token")
                .eq("name", "integration-jobs")
                .maybeSingle();
              return Boolean(data && token === data.token);
            })());
          if (!ok) return new Response("Unauthorized", { status: 401 });
        } else {
          return new Response("Unauthorized", { status: 401 });
        }

        const { claimDueJobs, completeJob, failJob } = await import("@/lib/jobs.server");
        const claimed = await claimDueJobs(supabaseAdmin, 25);
        let processed = 0;
        let failed = 0;
        for (const job of claimed as any[]) {
          try {
            if (job.job_type === "process_webhook_event") {
              const eventId = job.payload?.["webhook_event_id"];
              const { data: event } = await supabaseAdmin
                .from("integration_webhook_events")
                .select("id,provider,event_type,payload")
                .eq("id", eventId)
                .maybeSingle();
              if (event) {
                await supabaseAdmin
                  .from("integration_webhook_events")
                  .update({ status: "processed", processed_at: new Date().toISOString() })
                  .eq("id", event.id);
              }
              await completeJob(supabaseAdmin, job.id);
              processed += 1;
            } else {
              // Unknown job types are marked failed, never silently dropped.
              await failJob(supabaseAdmin, job, `No handler for job type ${job.job_type}.`);
              failed += 1;
            }
          } catch (caught) {
            await failJob(supabaseAdmin, job, caught instanceof Error ? caught.message : String(caught));
            failed += 1;
          }
        }
        return Response.json({ ok: true, claimed: claimed.length, processed, failed });
      },
    },
  },
});
