-- ===== Admin roles (least privilege, DB-backed) =====
CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','super_admin','security_admin','tech_lead','developer','qa','support')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.admin_roles TO authenticated;
GRANT ALL ON public.admin_roles TO service_role;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own admin roles" ON public.admin_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = _user_id AND role = ANY(_roles));
$$;

-- ===== Clients and client users =====
CREATE TABLE public.license_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.license_client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.license_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'client_admin' CHECK (role IN ('client_admin','client_member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
GRANT SELECT ON public.license_clients TO authenticated;
GRANT ALL ON public.license_clients TO service_role;
GRANT SELECT ON public.license_client_users TO authenticated;
GRANT ALL ON public.license_client_users TO service_role;
ALTER TABLE public.license_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_client_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_client_member(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.license_client_users WHERE user_id = _user_id AND client_id = _client_id);
$$;

CREATE POLICY "Staff and own client can view clients" ON public.license_clients FOR SELECT TO authenticated
USING (public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin','tech_lead','support','qa'])
       OR public.is_client_member(auth.uid(), id));
CREATE POLICY "Staff and self can view client users" ON public.license_client_users FOR SELECT TO authenticated
USING (user_id = auth.uid()
       OR public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin','support']));

-- ===== Plans and licenses =====
CREATE TABLE public.license_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  features text[] NOT NULL DEFAULT ARRAY['SCAN','REPORT','CSV'],
  max_domains integer NOT NULL DEFAULT 1,
  max_installations integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES public.license_clients(id) ON DELETE RESTRICT,
  plan_id uuid REFERENCES public.license_plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','expired','revoked','cancelled','transfer_pending')),
  features text[] NOT NULL DEFAULT ARRAY['SCAN','REPORT','CSV'],
  max_domains integer NOT NULL DEFAULT 1,
  max_installations integer NOT NULL DEFAULT 1,
  secret_hash text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  expires_at timestamptz,
  last_validated_at timestamptz,
  last_download_at timestamptz,
  current_version text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_licenses_client ON public.licenses (client_id, created_at DESC);
GRANT SELECT ON public.license_plans TO authenticated;
GRANT ALL ON public.license_plans TO service_role;
GRANT SELECT ON public.licenses TO authenticated;
GRANT ALL ON public.licenses TO service_role;
ALTER TABLE public.license_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read plans" ON public.license_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff and own client can view licenses" ON public.licenses FOR SELECT TO authenticated
USING (public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin','tech_lead','support','qa'])
       OR public.is_client_member(auth.uid(), client_id));

-- ===== Domains, installations, activations =====
CREATE TABLE public.license_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','revoked')),
  verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_id, domain)
);
CREATE UNIQUE INDEX idx_license_domain_unique_active ON public.license_domains (domain) WHERE status = 'active';

CREATE TABLE public.license_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_ref text NOT NULL UNIQUE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.license_clients(id) ON DELETE CASCADE,
  domain text NOT NULL,
  fingerprint_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reset','revoked')),
  version text,
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz,
  last_seen_ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_installation_active_fingerprint
  ON public.license_installations (license_id, fingerprint_hash) WHERE status = 'active';

CREATE TABLE public.license_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES public.license_installations(id) ON DELETE SET NULL,
  domain text,
  result text NOT NULL,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.license_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES public.license_installations(id) ON DELETE SET NULL,
  domain text,
  result text NOT NULL,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_license_validations_license ON public.license_validations (license_id, created_at DESC);
CREATE TABLE public.license_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  reason text NOT NULL,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.license_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  from_client_id uuid REFERENCES public.license_clients(id) ON DELETE SET NULL,
  to_client_id uuid REFERENCES public.license_clients(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT ON public.license_domains TO authenticated;
GRANT SELECT ON public.license_installations TO authenticated;
GRANT SELECT ON public.license_activations TO authenticated;
GRANT SELECT ON public.license_validations TO authenticated;
GRANT SELECT ON public.license_revocations TO authenticated;
GRANT SELECT ON public.license_transfers TO authenticated;
GRANT ALL ON public.license_domains TO service_role;
GRANT ALL ON public.license_installations TO service_role;
GRANT ALL ON public.license_activations TO service_role;
GRANT ALL ON public.license_validations TO service_role;
GRANT ALL ON public.license_revocations TO service_role;
GRANT ALL ON public.license_transfers TO service_role;
ALTER TABLE public.license_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_transfers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_license(_user_id uuid, _license_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_admin_role(_user_id, ARRAY['owner','super_admin','security_admin','tech_lead','support','qa'])
      OR EXISTS (
        SELECT 1 FROM public.licenses l
        WHERE l.id = _license_id AND public.is_client_member(_user_id, l.client_id)
      );
$$;

CREATE POLICY "Readable licence domains" ON public.license_domains FOR SELECT TO authenticated USING (public.can_read_license(auth.uid(), license_id));
CREATE POLICY "Readable installations" ON public.license_installations FOR SELECT TO authenticated USING (public.can_read_license(auth.uid(), license_id));
CREATE POLICY "Readable activations" ON public.license_activations FOR SELECT TO authenticated USING (public.can_read_license(auth.uid(), license_id));
CREATE POLICY "Readable validations" ON public.license_validations FOR SELECT TO authenticated USING (public.can_read_license(auth.uid(), license_id));
CREATE POLICY "Staff can view revocations" ON public.license_revocations FOR SELECT TO authenticated
USING (public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin']));
CREATE POLICY "Staff can view transfers" ON public.license_transfers FOR SELECT TO authenticated
USING (public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin']));

-- ===== Releases, download tokens, download events =====
CREATE TABLE public.license_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_ref text NOT NULL UNIQUE,
  version text NOT NULL,
  build_id text NOT NULL,
  channel text NOT NULL DEFAULT 'stable' CHECK (channel IN ('stable','beta')),
  checksum_sha256 text NOT NULL,
  signature text,
  signing_key_id text,
  artifact_path text NOT NULL,
  artifact_bytes bigint,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','rolled_back')),
  inspection_passed boolean NOT NULL DEFAULT false,
  inspection_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_supported_version text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE TABLE public.license_download_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  release_id uuid NOT NULL REFERENCES public.license_releases(id) ON DELETE CASCADE,
  issued_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  single_use boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_download_tokens_license ON public.license_download_tokens (license_id, created_at DESC);
CREATE TABLE public.license_download_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  release_id uuid REFERENCES public.license_releases(id) ON DELETE SET NULL,
  token_id uuid REFERENCES public.license_download_tokens(id) ON DELETE SET NULL,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  result text NOT NULL,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.license_releases TO authenticated;
GRANT SELECT ON public.license_download_events TO authenticated;
GRANT ALL ON public.license_releases TO service_role;
GRANT ALL ON public.license_download_tokens TO service_role;
GRANT ALL ON public.license_download_events TO service_role;
ALTER TABLE public.license_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_download_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_download_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view published releases" ON public.license_releases FOR SELECT TO authenticated
USING (status = 'published' OR public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin','tech_lead','qa']));
CREATE POLICY "Readable download history" ON public.license_download_events FOR SELECT TO authenticated
USING (public.can_read_license(auth.uid(), license_id));

-- ===== License events, security events, MFA, step-up, rate limits =====
CREATE TABLE public.license_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.license_clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  result text NOT NULL DEFAULT 'success',
  resource text,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_license_events_license ON public.license_events (license_id, created_at DESC);
CREATE TABLE public.license_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.license_clients(id) ON DELETE SET NULL,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  resource text,
  result text NOT NULL DEFAULT 'denied',
  message text NOT NULL,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_license_security_events_created ON public.license_security_events (created_at DESC);
CREATE TABLE public.admin_mfa (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  confirmed_at timestamptz,
  recovery_hashes text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_used_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_step_up (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX idx_step_up_user ON public.admin_step_up (user_id, expires_at DESC);
CREATE TABLE public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  key_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  UNIQUE (bucket, key_hash, window_start)
);

GRANT SELECT ON public.license_events TO authenticated;
GRANT SELECT ON public.license_security_events TO authenticated;
GRANT ALL ON public.license_events TO service_role;
GRANT ALL ON public.license_security_events TO service_role;
GRANT ALL ON public.admin_mfa TO service_role;
GRANT ALL ON public.admin_step_up TO service_role;
GRANT ALL ON public.security_rate_limits TO service_role;
ALTER TABLE public.license_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_step_up ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readable license events" ON public.license_events FOR SELECT TO authenticated USING (public.can_read_license(auth.uid(), license_id));
CREATE POLICY "Security staff can view security events" ON public.license_security_events FOR SELECT TO authenticated
USING (public.has_admin_role(auth.uid(), ARRAY['owner','super_admin','security_admin']));

CREATE TRIGGER touch_license_clients BEFORE UPDATE ON public.license_clients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_licenses BEFORE UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_license_installations BEFORE UPDATE ON public.license_installations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_admin_mfa BEFORE UPDATE ON public.admin_mfa FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.license_plans (code, name, features, max_domains, max_installations)
VALUES ('standard', 'Standard deployment', ARRAY['SCAN','REPORT','CSV'], 1, 1);