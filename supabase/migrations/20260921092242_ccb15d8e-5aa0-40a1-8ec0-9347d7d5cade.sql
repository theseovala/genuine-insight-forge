CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL,
  request_id text,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  provider text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read security events" ON public.security_events
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = security_events.workspace_id AND m.user_id = auth.uid()
  ));
CREATE INDEX security_events_workspace_created_idx ON public.security_events (workspace_id, created_at DESC);

CREATE TABLE public.provider_circuits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  state text NOT NULL DEFAULT 'closed',
  failure_count integer NOT NULL DEFAULT 0,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  opened_at timestamptz,
  cooldown_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);
GRANT SELECT ON public.provider_circuits TO authenticated;
GRANT ALL ON public.provider_circuits TO service_role;
ALTER TABLE public.provider_circuits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read provider circuits" ON public.provider_circuits
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = provider_circuits.workspace_id AND m.user_id = auth.uid()
  ));
CREATE TRIGGER provider_circuits_updated_at BEFORE UPDATE ON public.provider_circuits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();