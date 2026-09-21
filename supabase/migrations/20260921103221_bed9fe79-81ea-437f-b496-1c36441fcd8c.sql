
CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  website text,
  industry text,
  description text,
  phone text,
  email text,
  address text,
  country text,
  timezone text,
  status text NOT NULL DEFAULT 'active',
  source_provider text,
  confidence text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_status_check CHECK (status IN ('active','inactive','archived'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members manage businesses" ON public.businesses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = businesses.workspace_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = businesses.workspace_id AND m.user_id = auth.uid()));
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_businesses_workspace ON public.businesses (workspace_id, created_at DESC);

CREATE TABLE public.business_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  domain text NOT NULL,
  normalized_domain text NOT NULL,
  protocol text NOT NULL DEFAULT 'https',
  status text NOT NULL DEFAULT 'active',
  verification_status text NOT NULL DEFAULT 'unverified',
  ssl_status text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_domains_status_check CHECK (status IN ('active','inactive','removed')),
  CONSTRAINT business_domains_verification_check CHECK (verification_status IN ('unverified','reachable','failed')),
  CONSTRAINT business_domains_unique UNIQUE (workspace_id, normalized_domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_domains TO authenticated;
GRANT ALL ON public.business_domains TO service_role;
ALTER TABLE public.business_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members manage business domains" ON public.business_domains FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = business_domains.workspace_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = business_domains.workspace_id AND m.user_id = auth.uid()));
CREATE TRIGGER business_domains_updated_at BEFORE UPDATE ON public.business_domains FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_business_domains_business ON public.business_domains (business_id);

ALTER TABLE public.scans
  ADD COLUMN business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  ADD COLUMN domain_id uuid REFERENCES public.business_domains(id) ON DELETE SET NULL;
CREATE INDEX idx_scans_business ON public.scans (business_id, created_at DESC);
CREATE INDEX idx_scans_domain ON public.scans (domain_id, created_at DESC);

CREATE TABLE public.support_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  support_name text,
  phone text,
  whatsapp text,
  email text,
  hours text,
  help_url text,
  default_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_settings TO authenticated;
GRANT ALL ON public.support_settings TO service_role;
ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members manage support settings" ON public.support_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = support_settings.workspace_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = support_settings.workspace_id AND m.user_id = auth.uid()));
CREATE TRIGGER support_settings_updated_at BEFORE UPDATE ON public.support_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_scan_findings_scan ON public.scan_findings (scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_sources_scan ON public.scan_sources (scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_stages_scan ON public.scan_stages (scan_id);
CREATE INDEX IF NOT EXISTS idx_finding_evidence_scan ON public.finding_evidence (scan_id);
CREATE INDEX IF NOT EXISTS idx_business_facts_domain ON public.business_facts (workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_ai_runs_workspace ON public.ai_runs (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON public.audit_logs (workspace_id, created_at DESC);
