CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_workspace_member(_workspace_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION private.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_workspace_member(uuid, uuid) TO authenticated, service_role;

ALTER POLICY "Members read their workspaces" ON public.workspaces USING (private.is_workspace_member(id));
ALTER POLICY "Members read workspace membership" ON public.workspace_members USING (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage brand settings" ON public.brand_settings USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage locations" ON public.locations USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage platforms" ON public.connected_platforms USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage reviews" ON public.reviews USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage alerts" ON public.alerts USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage competitors" ON public.competitors USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage reports" ON public.reports USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members read Google connection" ON public.google_business_connections USING (private.is_workspace_member(workspace_id));
ALTER POLICY "Members create Google authorization state" ON public.google_oauth_states WITH CHECK (user_id = auth.uid() AND private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage sync history" ON public.sync_runs USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members manage alert rules" ON public.alert_rules USING (private.is_workspace_member(workspace_id)) WITH CHECK (private.is_workspace_member(workspace_id));
ALTER POLICY "Members read workspace AI activity" ON public.ai_runs USING (private.is_workspace_member(workspace_id));
ALTER POLICY "Members create workspace AI activity" ON public.ai_runs WITH CHECK (user_id = auth.uid() AND private.is_workspace_member(workspace_id));
DROP FUNCTION public.is_workspace_member(uuid, uuid);