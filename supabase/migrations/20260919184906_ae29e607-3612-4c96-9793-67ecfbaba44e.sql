DROP POLICY IF EXISTS "Owners update their workspaces" ON public.workspaces;

CREATE POLICY "Owners update their workspaces"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = workspaces.id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner','admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = workspaces.id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner','admin')
));

DROP POLICY IF EXISTS "Admins disconnect Google" ON public.google_business_connections;

CREATE POLICY "Admins disconnect Google"
ON public.google_business_connections
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = google_business_connections.workspace_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner','admin')
));

CREATE UNIQUE INDEX IF NOT EXISTS reviews_workspace_platform_external_key
  ON public.reviews (workspace_id, platform, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS alerts_workspace_open_idx
  ON public.alerts (workspace_id, resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS reviews_workspace_created_idx
  ON public.reviews (workspace_id, external_created_at DESC);