-- ============ Scan engine foundation ============
CREATE TABLE public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_url text NOT NULL,
  target_domain text NOT NULL,
  scan_type text NOT NULL DEFAULT 'website' CHECK (scan_type IN ('website','reputation','seo','full')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  score integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  duration_ms integer,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_workspace_created_idx ON public.scans (workspace_id, created_at DESC);
CREATE INDEX scans_status_idx ON public.scans (status, created_at);
CREATE INDEX scans_domain_idx ON public.scans (workspace_id, target_domain);

-- RAW layer: exactly what each source returned
CREATE TABLE public.scan_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source text NOT NULL,
  provider text,
  status text NOT NULL CHECK (status IN ('completed','failed','skipped','not_configured')),
  http_status integer,
  duration_ms integer,
  error_message text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, source)
);
CREATE INDEX scan_sources_scan_idx ON public.scan_sources (scan_id);

-- NORMALIZED layer
CREATE TABLE public.scan_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category text NOT NULL,
  metric_key text NOT NULL,
  value_numeric numeric,
  value_text text,
  unit text,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, category, metric_key)
);
CREATE INDEX scan_metrics_scan_idx ON public.scan_metrics (scan_id, category);

-- ANALYSIS layer
CREATE TABLE public.scan_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category text NOT NULL,
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  title text NOT NULL,
  detail text NOT NULL,
  recommendation text,
  impact integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, code)
);
CREATE INDEX scan_findings_scan_idx ON public.scan_findings (scan_id, severity);

-- REPORT layer
CREATE TABLE public.scan_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  score integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  category_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  model text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id)
);

-- ============ Provider resource / raw data foundation ============
CREATE TABLE public.provider_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  external_id text NOT NULL,
  parent_external_id text,
  name text,
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, resource_type, external_id)
);
CREATE INDEX provider_resources_workspace_idx ON public.provider_resources (workspace_id, provider);

CREATE TABLE public.provider_raw_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  resource_type text NOT NULL,
  external_id text,
  scan_id uuid REFERENCES public.scans(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provider_raw_data_workspace_idx ON public.provider_raw_data (workspace_id, provider, fetched_at DESC);

-- ============ Shared SEO model ============
CREATE TABLE public.seo_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  keyword text NOT NULL,
  search_engine text NOT NULL DEFAULT 'google',
  location text,
  language text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain, keyword, search_engine, location, language)
);
CREATE INDEX seo_keywords_workspace_idx ON public.seo_keywords (workspace_id, domain);

CREATE TABLE public.seo_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  keyword_id uuid NOT NULL REFERENCES public.seo_keywords(id) ON DELETE CASCADE,
  provider text NOT NULL,
  position integer,
  url text,
  serp_features jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seo_rankings_keyword_idx ON public.seo_rankings (keyword_id, checked_at DESC);

CREATE TABLE public.seo_backlinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  domain text NOT NULL,
  source_url text NOT NULL,
  target_url text,
  anchor text,
  authority numeric,
  is_nofollow boolean,
  provider text NOT NULL,
  first_seen date,
  last_seen date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, domain, source_url, provider)
);
CREATE INDEX seo_backlinks_workspace_idx ON public.seo_backlinks (workspace_id, domain);

-- ============ Grants ============
GRANT SELECT, INSERT, UPDATE ON public.scans TO authenticated;
GRANT SELECT ON public.scan_sources, public.scan_metrics, public.scan_findings, public.scan_reports TO authenticated;
GRANT SELECT ON public.provider_resources, public.provider_raw_data TO authenticated;
GRANT SELECT ON public.seo_keywords, public.seo_rankings, public.seo_backlinks TO authenticated;
GRANT ALL ON public.scans, public.scan_sources, public.scan_metrics, public.scan_findings, public.scan_reports,
  public.provider_resources, public.provider_raw_data,
  public.seo_keywords, public.seo_rankings, public.seo_backlinks TO service_role;

-- ============ RLS ============
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_raw_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_backlinks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read scans" ON public.scans FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scans.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members create scans" ON public.scans FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scans.workspace_id AND m.user_id = auth.uid()) AND requested_by = auth.uid());
CREATE POLICY "Members cancel scans" ON public.scans FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scans.workspace_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scans.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "Members read scan sources" ON public.scan_sources FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scan_sources.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read scan metrics" ON public.scan_metrics FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scan_metrics.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read scan findings" ON public.scan_findings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scan_findings.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read scan reports" ON public.scan_reports FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = scan_reports.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read provider resources" ON public.provider_resources FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = provider_resources.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read provider raw data" ON public.provider_raw_data FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = provider_raw_data.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read seo keywords" ON public.seo_keywords FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = seo_keywords.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read seo rankings" ON public.seo_rankings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = seo_rankings.workspace_id AND m.user_id = auth.uid()));
CREATE POLICY "Members read seo backlinks" ON public.seo_backlinks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = seo_backlinks.workspace_id AND m.user_id = auth.uid()));

-- timestamps
CREATE TRIGGER touch_scans BEFORE UPDATE ON public.scans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_provider_resources BEFORE UPDATE ON public.provider_resources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_seo_keywords BEFORE UPDATE ON public.seo_keywords FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();