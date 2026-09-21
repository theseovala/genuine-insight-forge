ALTER TABLE public.scan_findings
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS priority_score numeric,
  ADD COLUMN IF NOT EXISTS priority_rank integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS change_state text NOT NULL DEFAULT 'new';

ALTER TABLE public.scan_reports
  ADD COLUMN IF NOT EXISTS sections jsonb,
  ADD COLUMN IF NOT EXISTS action_plan jsonb,
  ADD COLUMN IF NOT EXISTS historical jsonb,
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'skipped',
  ADD COLUMN IF NOT EXISTS ai_error text,
  ADD COLUMN IF NOT EXISTS ai_latency_ms integer,
  ADD COLUMN IF NOT EXISTS ai_context_hash text;

ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS input_tokens integer,
  ADD COLUMN IF NOT EXISTS output_tokens integer;

CREATE INDEX IF NOT EXISTS ai_runs_input_hash_idx ON public.ai_runs (input_hash, status, created_at DESC);