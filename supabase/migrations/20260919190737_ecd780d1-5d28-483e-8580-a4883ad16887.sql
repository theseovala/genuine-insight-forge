CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.removal_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  violation_type text not null,
  confidence numeric(4,3) not null default 0,
  rationale text not null,
  appeal_text text,
  status text not null default 'flagged',
  model text,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, review_id)
);

CREATE TABLE public.removal_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  started_by uuid references auth.users(id),
  reviews_checked integer not null default 0,
  reviews_flagged integer not null default 0,
  model text,
  duration_ms integer,
  status text not null default 'completed',
  error_message text,
  created_at timestamptz not null default now()
);

CREATE INDEX removal_cases_workspace_status_idx ON public.removal_cases (workspace_id, status, created_at DESC);
CREATE INDEX removal_scans_workspace_idx ON public.removal_scans (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.removal_cases TO authenticated;
GRANT ALL ON public.removal_cases TO service_role;
GRANT SELECT, INSERT ON public.removal_scans TO authenticated;
GRANT ALL ON public.removal_scans TO service_role;

ALTER TABLE public.removal_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.removal_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read removal cases" ON public.removal_cases FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));
CREATE POLICY "Members create removal cases" ON public.removal_cases FOR INSERT TO authenticated
  WITH CHECK (private.is_workspace_member(workspace_id));
CREATE POLICY "Members update removal cases" ON public.removal_cases FOR UPDATE TO authenticated
  USING (private.is_workspace_member(workspace_id))
  WITH CHECK (private.is_workspace_member(workspace_id));
CREATE POLICY "Owners delete removal cases" ON public.removal_cases FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = removal_cases.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

CREATE POLICY "Members read removal scans" ON public.removal_scans FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));
CREATE POLICY "Members create removal scans" ON public.removal_scans FOR INSERT TO authenticated
  WITH CHECK (private.is_workspace_member(workspace_id));

CREATE TRIGGER removal_cases_updated_at BEFORE UPDATE ON public.removal_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();