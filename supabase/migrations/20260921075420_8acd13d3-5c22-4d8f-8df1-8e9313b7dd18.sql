CREATE OR REPLACE FUNCTION public.assert_ai_run_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.review_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reviews r WHERE r.id = NEW.review_id AND r.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'review_id does not belong to this workspace';
  END IF;
  IF NEW.report_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reports rp WHERE rp.id = NEW.report_id AND rp.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'report_id does not belong to this workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_runs_reference_guard ON public.ai_runs;
CREATE TRIGGER ai_runs_reference_guard
BEFORE INSERT OR UPDATE ON public.ai_runs
FOR EACH ROW EXECUTE FUNCTION public.assert_ai_run_references();

CREATE OR REPLACE FUNCTION public.assert_removal_case_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.review_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reviews r WHERE r.id = NEW.review_id AND r.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'review_id does not belong to this workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS removal_cases_reference_guard ON public.removal_cases;
CREATE TRIGGER removal_cases_reference_guard
BEFORE INSERT OR UPDATE ON public.removal_cases
FOR EACH ROW EXECUTE FUNCTION public.assert_removal_case_references();

DROP POLICY IF EXISTS "Members read Google connection" ON public.google_business_connections;
CREATE POLICY "Admins read Google connection"
ON public.google_business_connections
FOR SELECT
TO authenticated
USING (private.has_workspace_role(workspace_id, ARRAY['owner'::workspace_role, 'admin'::workspace_role]));