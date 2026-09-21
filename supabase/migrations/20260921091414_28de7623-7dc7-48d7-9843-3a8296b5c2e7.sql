CREATE TABLE public.business_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  field_key text NOT NULL,
  value_normalized text NOT NULL,
  value_raw text,
  source_provider text NOT NULL,
  source_type text NOT NULL,
  external_id text,
  source_url text,
  confidence text NOT NULL DEFAULT 'unverified',
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  previous_value text,
  changed_at timestamptz,
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain, field_key, source_provider)
);
CREATE INDEX business_facts_workspace_domain_idx ON public.business_facts (workspace_id, domain);
CREATE INDEX business_facts_scan_idx ON public.business_facts (scan_id);
GRANT SELECT ON public.business_facts TO authenticated;
GRANT ALL ON public.business_facts TO service_role;
ALTER TABLE public.business_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read business facts" ON public.business_facts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = business_facts.workspace_id AND m.user_id = auth.uid()));
CREATE TRIGGER business_facts_updated_at BEFORE UPDATE ON public.business_facts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.finding_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.scan_findings(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_type text NOT NULL,
  reference text,
  value text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finding_evidence_finding_idx ON public.finding_evidence (finding_id);
CREATE INDEX finding_evidence_scan_idx ON public.finding_evidence (scan_id);
GRANT SELECT ON public.finding_evidence TO authenticated;
GRANT ALL ON public.finding_evidence TO service_role;
ALTER TABLE public.finding_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read evidence" ON public.finding_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = finding_evidence.workspace_id AND m.user_id = auth.uid()));

CREATE TABLE public.data_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  field_key text NOT NULL,
  source_a text NOT NULL,
  value_a text NOT NULL,
  observed_a_at timestamptz NOT NULL,
  source_b text NOT NULL,
  value_b text NOT NULL,
  observed_b_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  scan_id uuid REFERENCES public.scans(id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain, field_key, source_a, source_b)
);
CREATE INDEX data_conflicts_workspace_domain_idx ON public.data_conflicts (workspace_id, domain, status);
GRANT SELECT ON public.data_conflicts TO authenticated;
GRANT ALL ON public.data_conflicts TO service_role;
ALTER TABLE public.data_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read data conflicts" ON public.data_conflicts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = data_conflicts.workspace_id AND m.user_id = auth.uid()));
CREATE TRIGGER data_conflicts_updated_at BEFORE UPDATE ON public.data_conflicts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();