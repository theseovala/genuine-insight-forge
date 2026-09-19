CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Seovale',
  slug text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);
GRANT SELECT ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid DEFAULT auth.uid())
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
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;

CREATE POLICY "Members read their workspaces" ON public.workspaces FOR SELECT TO authenticated
USING (public.is_workspace_member(id));
CREATE POLICY "Owners update their workspaces" ON public.workspaces FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));
CREATE POLICY "Members read workspace membership" ON public.workspace_members FOR SELECT TO authenticated
USING (public.is_workspace_member(workspace_id));

INSERT INTO public.workspaces (name, slug)
VALUES ('Seovale Demo', 'seovale-demo')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, u.id, 'owner'::public.workspace_role
FROM public.workspaces w CROSS JOIN auth.users u
WHERE w.slug = 'seovale-demo'
ON CONFLICT (workspace_id, user_id) DO NOTHING;

ALTER TABLE public.brand_settings ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.locations ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.connected_platforms ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.alerts ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.competitors ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.reports ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

UPDATE public.brand_settings SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;
UPDATE public.locations SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;
UPDATE public.connected_platforms SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;
UPDATE public.reviews SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;
UPDATE public.alerts SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;
UPDATE public.competitors SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;
UPDATE public.reports SET workspace_id = (SELECT id FROM public.workspaces WHERE slug = 'seovale-demo') WHERE workspace_id IS NULL;

ALTER TABLE public.brand_settings ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.locations ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.connected_platforms ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.reviews ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.alerts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.competitors ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.reports ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX brand_settings_workspace_idx ON public.brand_settings(workspace_id);
CREATE INDEX locations_workspace_idx ON public.locations(workspace_id);
CREATE INDEX connected_platforms_workspace_idx ON public.connected_platforms(workspace_id);
CREATE INDEX reviews_workspace_created_idx ON public.reviews(workspace_id, external_created_at DESC);
CREATE INDEX alerts_workspace_created_idx ON public.alerts(workspace_id, created_at DESC);
CREATE INDEX competitors_workspace_idx ON public.competitors(workspace_id);
CREATE INDEX reports_workspace_created_idx ON public.reports(workspace_id, created_at DESC);
CREATE UNIQUE INDEX connected_platforms_workspace_platform_uidx ON public.connected_platforms(workspace_id, platform);
CREATE UNIQUE INDEX reviews_workspace_external_uidx ON public.reviews(workspace_id, platform, external_id) WHERE external_id IS NOT NULL;

DROP POLICY "Team reads brand settings" ON public.brand_settings;
DROP POLICY "Team updates brand settings" ON public.brand_settings;
DROP POLICY "Team manages locations" ON public.locations;
DROP POLICY "Team manages platforms" ON public.connected_platforms;
DROP POLICY "Team manages reviews" ON public.reviews;
DROP POLICY "Team manages alerts" ON public.alerts;
DROP POLICY "Team manages competitors" ON public.competitors;
DROP POLICY "Team manages reports" ON public.reports;

CREATE POLICY "Members manage brand settings" ON public.brand_settings FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage locations" ON public.locations FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage platforms" ON public.connected_platforms FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage reviews" ON public.reviews FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage alerts" ON public.alerts FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage competitors" ON public.competitors FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Members manage reports" ON public.reports FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));

CREATE TABLE public.google_business_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  google_account_email text,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','needs_reconnect','revoked')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.google_business_connections TO authenticated;
GRANT ALL ON public.google_business_connections TO service_role;
ALTER TABLE public.google_business_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read Google connection" ON public.google_business_connections FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Admins disconnect Google" ON public.google_business_connections FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = google_business_connections.workspace_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')));
CREATE TRIGGER touch_google_business_connections BEFORE UPDATE ON public.google_business_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.google_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE,
  code_verifier_ciphertext text NOT NULL,
  redirect_origin text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.google_oauth_states TO authenticated;
GRANT ALL ON public.google_oauth_states TO service_role;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members create Google authorization state" ON public.google_oauth_states FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));
CREATE INDEX google_oauth_states_expiry_idx ON public.google_oauth_states(expires_at) WHERE used_at IS NULL;

CREATE OR REPLACE FUNCTION public.claim_google_oauth_state(_state_hash text)
RETURNS SETOF public.google_oauth_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.google_oauth_states
  SET used_at = now()
  WHERE state_hash = _state_hash AND used_at IS NULL AND expires_at > now()
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_google_oauth_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_oauth_state(text) TO service_role;

CREATE TABLE public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  locations_found integer NOT NULL DEFAULT 0,
  reviews_found integer NOT NULL DEFAULT 0,
  reviews_created integer NOT NULL DEFAULT 0,
  reviews_updated integer NOT NULL DEFAULT 0,
  alerts_created integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.sync_runs TO authenticated;
GRANT ALL ON public.sync_runs TO service_role;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage sync history" ON public.sync_runs FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE INDEX sync_runs_workspace_started_idx ON public.sync_runs(workspace_id, started_at DESC);

CREATE TABLE public.alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  negative_rating_threshold integer NOT NULL DEFAULT 2 CHECK (negative_rating_threshold BETWEEN 1 AND 5),
  unanswered_hours integer NOT NULL DEFAULT 24 CHECK (unanswered_hours BETWEEN 1 AND 720),
  rating_drop_threshold numeric NOT NULL DEFAULT 0.3 CHECK (rating_drop_threshold > 0 AND rating_drop_threshold <= 5),
  volume_spike_percent integer NOT NULL DEFAULT 100 CHECK (volume_spike_percent BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rules TO authenticated;
GRANT ALL ON public.alert_rules TO service_role;
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage alert rules" ON public.alert_rules FOR ALL TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));
CREATE TRIGGER touch_alert_rules BEFORE UPDATE ON public.alert_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.alert_rules (workspace_id) SELECT id FROM public.workspaces ON CONFLICT (workspace_id) DO NOTHING;

CREATE TABLE public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('reply_draft','feedback_briefing','reputation_report')),
  model text NOT NULL,
  input_hash text NOT NULL,
  output text,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  status text NOT NULL CHECK (status IN ('completed','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workspace AI activity" ON public.ai_runs FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Members create workspace AI activity" ON public.ai_runs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));
CREATE INDEX ai_runs_workspace_created_idx ON public.ai_runs(workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces (name, slug, created_by)
  VALUES ('Seovale', 'seovale-' || replace(NEW.id::text, '-', ''), NEW.id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  INSERT INTO public.brand_settings (workspace_id, brand_name, reply_signature)
  VALUES (new_workspace_id, 'Seovale', 'The Seovale customer care team');

  INSERT INTO public.alert_rules (workspace_id) VALUES (new_workspace_id);

  INSERT INTO public.connected_platforms (workspace_id, platform, display_name, supports_oauth)
  VALUES
    (new_workspace_id, 'google', 'Google Business Profile', true),
    (new_workspace_id, 'facebook', 'Facebook', true),
    (new_workspace_id, 'trustpilot', 'Trustpilot', true),
    (new_workspace_id, 'tripadvisor', 'Tripadvisor', false),
    (new_workspace_id, 'instagram', 'Instagram', true),
    (new_workspace_id, 'yelp', 'Yelp', false);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

CREATE TRIGGER touch_workspaces BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();