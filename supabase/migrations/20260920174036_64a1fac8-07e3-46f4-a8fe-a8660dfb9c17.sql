CREATE TABLE public.scheduler_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.scheduler_tokens TO service_role;

ALTER TABLE public.scheduler_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.scheduler_tokens (name, token)
VALUES ('removal-scan', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('seovale-removal-scan')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seovale-removal-scan');

SELECT cron.schedule(
  'seovale-removal-scan',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--3909161c-29f3-4466-a802-1204f20720c3.lovable.app/api/public/removal-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT token FROM public.scheduler_tokens WHERE name = 'removal-scan')
    ),
    body := '{}'::jsonb
  );
  $job$
);