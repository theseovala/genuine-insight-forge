CREATE TABLE public.removal_scan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  interval_minutes integer NOT NULL DEFAULT 360 CHECK (interval_minutes >= 15 AND interval_minutes <= 10080),
  batch_size integer NOT NULL DEFAULT 40 CHECK (batch_size >= 5 AND batch_size <= 120),
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  paused_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.removal_scan_settings TO authenticated;
GRANT ALL ON public.removal_scan_settings TO service_role;

ALTER TABLE public.removal_scan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view scan settings"
ON public.removal_scan_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = removal_scan_settings.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "Owners and admins can create scan settings"
ON public.removal_scan_settings FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = removal_scan_settings.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

CREATE POLICY "Owners and admins can update scan settings"
ON public.removal_scan_settings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = removal_scan_settings.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = removal_scan_settings.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));

CREATE TRIGGER update_removal_scan_settings_updated_at
BEFORE UPDATE ON public.removal_scan_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.removal_scan_settings (workspace_id)
SELECT id FROM public.workspaces
ON CONFLICT (workspace_id) DO NOTHING;