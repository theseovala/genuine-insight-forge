
-- 1. Platform-level (Super Admin) roles, in their own table
CREATE TYPE public.platform_role AS ENUM ('super_admin');

CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.platform_role NOT NULL DEFAULT 'super_admin',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own platform role"
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Tenant hierarchy on the existing workspace model
CREATE TYPE public.workspace_kind AS ENUM ('agency', 'client', 'business');

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS kind public.workspace_kind NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS parent_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS workspaces_parent_idx ON public.workspaces(parent_workspace_id);

CREATE OR REPLACE FUNCTION public.assert_workspace_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cursor_id uuid;
  depth int := 0;
BEGIN
  IF NEW.parent_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_workspace_id = NEW.id THEN
    RAISE EXCEPTION 'A workspace cannot be its own parent';
  END IF;
  cursor_id := NEW.parent_workspace_id;
  WHILE cursor_id IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 10 THEN
      RAISE EXCEPTION 'Workspace hierarchy is too deep';
    END IF;
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'Workspace hierarchy cannot contain a cycle';
    END IF;
    SELECT parent_workspace_id INTO cursor_id FROM public.workspaces WHERE id = cursor_id;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_hierarchy_guard ON public.workspaces;
CREATE TRIGGER workspaces_hierarchy_guard
  BEFORE INSERT OR UPDATE OF parent_workspace_id ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.assert_workspace_hierarchy();

-- 3. Authorization helpers (security definer, no recursion into RLS)
CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid() AND pa.role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION private.workspace_lineage(_workspace_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE lineage AS (
    SELECT w.id, w.parent_workspace_id FROM public.workspaces w WHERE w.id = _workspace_id
    UNION ALL
    SELECT w.id, w.parent_workspace_id
    FROM public.workspaces w
    JOIN lineage l ON w.id = l.parent_workspace_id
  )
  SELECT id FROM lineage;
$$;

CREATE OR REPLACE FUNCTION private.has_workspace_role(_workspace_id uuid, _roles public.workspace_role[], _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.user_id = _user_id
      AND m.role = ANY (_roles)
      AND (
        m.workspace_id = _workspace_id
        OR (
          m.role IN ('owner', 'admin')
          AND m.workspace_id IN (SELECT private.workspace_lineage(_workspace_id))
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.is_workspace_member(_workspace_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.workspace_members m
    WHERE m.user_id = _user_id
      AND (
        m.workspace_id = _workspace_id
        OR (
          m.role IN ('owner', 'admin')
          AND m.workspace_id IN (SELECT private.workspace_lineage(_workspace_id))
        )
      )
  );
$$;

-- 4. Route every remaining inline membership check through the helpers
DROP POLICY IF EXISTS "Members can read workspace audit logs" ON public.audit_logs;
CREATE POLICY "Members can read workspace audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Admins disconnect Google" ON public.google_business_connections;
CREATE POLICY "Admins disconnect Google" ON public.google_business_connections
  FOR DELETE TO authenticated
  USING (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));

DROP POLICY IF EXISTS "Members can read workspace api logs" ON public.integration_api_logs;
CREATE POLICY "Members can read workspace api logs" ON public.integration_api_logs
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can read workspace health" ON public.integration_health;
CREATE POLICY "Members can read workspace health" ON public.integration_health
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can read workspace rate limits" ON public.integration_rate_limits;
CREATE POLICY "Members can read workspace rate limits" ON public.integration_rate_limits
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can read workspace sync jobs" ON public.integration_sync_jobs;
CREATE POLICY "Members can read workspace sync jobs" ON public.integration_sync_jobs
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can read workspace usage" ON public.integration_usage;
CREATE POLICY "Members can read workspace usage" ON public.integration_usage
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can read workspace webhook events" ON public.integration_webhook_events;
CREATE POLICY "Members can read workspace webhook events" ON public.integration_webhook_events
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read provider raw data" ON public.provider_raw_data;
CREATE POLICY "Members read provider raw data" ON public.provider_raw_data
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read provider resources" ON public.provider_resources;
CREATE POLICY "Members read provider resources" ON public.provider_resources
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Owners delete removal cases" ON public.removal_cases;
CREATE POLICY "Owners delete removal cases" ON public.removal_cases
  FOR DELETE TO authenticated
  USING (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));

DROP POLICY IF EXISTS "Members can view scan settings" ON public.removal_scan_settings;
CREATE POLICY "Members can view scan settings" ON public.removal_scan_settings
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Owners and admins can update scan settings" ON public.removal_scan_settings;
CREATE POLICY "Owners and admins can update scan settings" ON public.removal_scan_settings
  FOR UPDATE TO authenticated
  USING (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (private.has_workspace_role(workspace_id, ARRAY['owner','admin']::public.workspace_role[]));

DROP POLICY IF EXISTS "Members read scan findings" ON public.scan_findings;
CREATE POLICY "Members read scan findings" ON public.scan_findings
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read scan metrics" ON public.scan_metrics;
CREATE POLICY "Members read scan metrics" ON public.scan_metrics
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read scan reports" ON public.scan_reports;
CREATE POLICY "Members read scan reports" ON public.scan_reports
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read scan sources" ON public.scan_sources;
CREATE POLICY "Members read scan sources" ON public.scan_sources
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Workspace members read scan stages" ON public.scan_stages;
CREATE POLICY "Workspace members read scan stages" ON public.scan_stages
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read scans" ON public.scans;
CREATE POLICY "Members read scans" ON public.scans
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members cancel scans" ON public.scans;
CREATE POLICY "Members cancel scans" ON public.scans
  FOR UPDATE TO authenticated
  USING (private.is_workspace_member(workspace_id))
  WITH CHECK (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read seo backlinks" ON public.seo_backlinks;
CREATE POLICY "Members read seo backlinks" ON public.seo_backlinks
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read seo keywords" ON public.seo_keywords;
CREATE POLICY "Members read seo keywords" ON public.seo_keywords
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members read seo rankings" ON public.seo_rankings;
CREATE POLICY "Members read seo rankings" ON public.seo_rankings
  FOR SELECT TO authenticated USING (private.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Owners update their workspaces" ON public.workspaces;
CREATE POLICY "Owners update their workspaces" ON public.workspaces
  FOR UPDATE TO authenticated
  USING (private.has_workspace_role(id, ARRAY['owner']::public.workspace_role[]))
  WITH CHECK (private.has_workspace_role(id, ARRAY['owner']::public.workspace_role[]));
