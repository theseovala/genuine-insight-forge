ALTER TABLE public.scans DROP CONSTRAINT scans_status_check;
ALTER TABLE public.scans ADD CONSTRAINT scans_status_check CHECK (status = ANY (ARRAY['queued','running','paused','retrying','completed','failed','cancelled']));

CREATE TABLE public.scan_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','running','completed','skipped','failed'])),
  detail TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_id, stage)
);
CREATE INDEX scan_stages_scan_idx ON public.scan_stages(scan_id, position);

GRANT SELECT ON public.scan_stages TO authenticated;
GRANT ALL ON public.scan_stages TO service_role;
ALTER TABLE public.scan_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read scan stages" ON public.scan_stages
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scan_stages.workspace_id AND m.user_id = auth.uid()));