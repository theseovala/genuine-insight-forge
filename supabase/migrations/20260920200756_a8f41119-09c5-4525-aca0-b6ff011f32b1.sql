-- lovable-cron-fallback-reviewed: hourly retry backstop for the integration job queue; fresh webhook events are processed inline on arrival, so only failed events hit this runner.
INSERT INTO public.scheduler_tokens (name, token)
VALUES ('integration-jobs', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('seovale-integration-jobs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seovale-integration-jobs');

SELECT cron.schedule(
  'seovale-integration-jobs',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--3909161c-29f3-4466-a802-1204f20720c3.lovable.app/api/public/integrations/jobs-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT token FROM public.scheduler_tokens WHERE name = 'integration-jobs')
    ),
    body := '{}'::jsonb
  );
  $job$
);