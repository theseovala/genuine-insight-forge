CREATE TABLE public.integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','retrying','cancelled')),
  priority integer NOT NULL DEFAULT 5,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_sync_jobs_idem ON public.integration_sync_jobs (workspace_id, provider, job_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX integration_sync_jobs_due ON public.integration_sync_jobs (status, next_attempt_at)
  WHERE status IN ('pending','retrying');
CREATE INDEX integration_sync_jobs_ws ON public.integration_sync_jobs (workspace_id, created_at DESC);

CREATE TABLE public.integration_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text,
  event_type text NOT NULL,
  signature_valid boolean,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processing','processed','failed','rejected')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_webhook_events_dedupe ON public.integration_webhook_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX integration_webhook_events_ws ON public.integration_webhook_events (workspace_id, created_at DESC);

CREATE TABLE public.integration_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  operation text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  endpoint text NOT NULL,
  http_status integer,
  duration_ms integer,
  outcome_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_api_logs_ws ON public.integration_api_logs (workspace_id, provider, created_at DESC);

CREATE TABLE public.integration_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  metric text NOT NULL,
  value numeric NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  source text NOT NULL DEFAULT 'api_response',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, metric, period_start)
);

CREATE TABLE public.integration_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  limit_value integer,
  remaining integer,
  reset_at timestamptz,
  source text NOT NULL DEFAULT 'api_response',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

CREATE TABLE public.integration_health (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL,
  latency_ms integer,
  outcome_code text,
  last_error text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz,
  PRIMARY KEY (workspace_id, provider)
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_ws ON public.audit_logs (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_sync_jobs, public.integration_webhook_events,
  public.integration_api_logs, public.integration_usage, public.integration_rate_limits,
  public.integration_health, public.audit_logs TO authenticated;
GRANT ALL ON public.integration_sync_jobs, public.integration_webhook_events, public.integration_api_logs,
  public.integration_usage, public.integration_rate_limits, public.integration_health, public.audit_logs TO service_role;

ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read workspace sync jobs" ON public.integration_sync_jobs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = integration_sync_jobs.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read workspace webhook events" ON public.integration_webhook_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = integration_webhook_events.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read workspace api logs" ON public.integration_api_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = integration_api_logs.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read workspace usage" ON public.integration_usage
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = integration_usage.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read workspace rate limits" ON public.integration_rate_limits
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = integration_rate_limits.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read workspace health" ON public.integration_health
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = integration_health.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members can read workspace audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = audit_logs.workspace_id AND m.user_id = auth.uid()));

CREATE TRIGGER integration_sync_jobs_updated_at BEFORE UPDATE ON public.integration_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();