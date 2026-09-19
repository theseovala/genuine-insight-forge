-- Seovale reputation command center schema

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  job_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.brand_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL DEFAULT 'Seovale',
  industry text NOT NULL DEFAULT 'Multi-location retail & hospitality',
  website text,
  reply_tone text NOT NULL DEFAULT 'warm-professional',
  reply_signature text NOT NULL DEFAULT 'The Seovale customer care team',
  alert_email text,
  negative_review_alerts boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  city text NOT NULL,
  country text NOT NULL,
  manager text,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.connected_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE,
  display_name text NOT NULL,
  account_ref text,
  status text NOT NULL DEFAULT 'disconnected',
  supports_oauth boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_credentials (
  platform text PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  account_name text,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  external_id text,
  source text NOT NULL DEFAULT 'seed',
  author text NOT NULL,
  rating int NOT NULL DEFAULT 5,
  sentiment text NOT NULL DEFAULT 'neutral',
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'low',
  location_name text NOT NULL DEFAULT 'All locations',
  title text,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  unread boolean NOT NULL DEFAULT true,
  reply text,
  replied_at timestamptz,
  replied_by uuid,
  external_created_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX reviews_created_idx ON public.reviews (external_created_at DESC);
CREATE INDEX reviews_location_idx ON public.reviews (location_name);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  detail text NOT NULL,
  location_name text NOT NULL DEFAULT 'All locations',
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_you boolean NOT NULL DEFAULT false,
  rating numeric(2,1) NOT NULL DEFAULT 4.0,
  review_count int NOT NULL DEFAULT 0,
  sentiment_score int NOT NULL DEFAULT 70,
  response_rate int NOT NULL DEFAULT 70,
  trend numeric(3,1) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  period text NOT NULL,
  scope text NOT NULL DEFAULT 'All locations',
  summary text,
  status text NOT NULL DEFAULT 'ready',
  generated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.brand_settings TO authenticated;
GRANT ALL ON public.brand_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connected_platforms TO authenticated;
GRANT ALL ON public.connected_platforms TO service_role;
GRANT ALL ON public.platform_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Team reads brand settings" ON public.brand_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team updates brand settings" ON public.brand_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Team manages locations" ON public.locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team manages platforms" ON public.connected_platforms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team manages reviews" ON public.reviews
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team manages alerts" ON public.alerts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team manages competitors" ON public.competitors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Team manages reports" ON public.reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_brand_settings BEFORE UPDATE ON public.brand_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_platforms BEFORE UPDATE ON public.connected_platforms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_reviews BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_competitors BEFORE UPDATE ON public.competitors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_credentials BEFORE UPDATE ON public.platform_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.brand_settings (brand_name, industry, website, alert_email)
VALUES ('Seovale', 'Multi-location retail & hospitality', 'https://seovale.com', 'care@seovale.com');

INSERT INTO public.locations (name, city, country, manager) VALUES
  ('Mumbai — Bandra Kurla', 'Mumbai', 'India', 'Ananya Rao'),
  ('Dubai — Marina Walk', 'Dubai', 'United Arab Emirates', 'Omar Haddad'),
  ('London — Soho Square', 'London', 'United Kingdom', 'Grace Whitfield'),
  ('New York — Midtown East', 'New York', 'United States', 'Marcus Bell'),
  ('Singapore — Orchard Road', 'Singapore', 'Singapore', 'Wei Lin Tan'),
  ('Sydney — CBD George St', 'Sydney', 'Australia', 'Chloe Parker');

INSERT INTO public.connected_platforms (platform, display_name, account_ref, status, supports_oauth) VALUES
  ('google', 'Google Business Profile', NULL, 'disconnected', true),
  ('facebook', 'Facebook Pages', NULL, 'disconnected', false),
  ('instagram', 'Instagram', NULL, 'disconnected', false),
  ('trustpilot', 'Trustpilot', NULL, 'disconnected', false),
  ('yelp', 'Yelp', NULL, 'disconnected', false),
  ('tripadvisor', 'TripAdvisor', NULL, 'disconnected', false),
  ('youtube', 'YouTube', NULL, 'disconnected', false);

INSERT INTO public.competitors (name, is_you, rating, review_count, sentiment_score, response_rate, trend, notes) VALUES
  ('Seovale (your brand)', true, 4.4, 0, 0, 0, 0, 'Live figures are computed from your own review data.'),
  ('Northline Group', false, 4.6, 18420, 78, 83, 0.4, 'Strongest on volume; slower to answer negative reviews.'),
  ('Harbour & Co.', false, 4.2, 9310, 65, 61, -1.2, 'Response rate falling since the summer.'),
  ('Meridian Retail', false, 4.0, 7480, 58, 55, -0.6, 'Frequent complaints about delivery windows.'),
  ('Kestrel Hospitality', false, 4.5, 12060, 74, 88, 1.1, 'Answers almost every review within 24 hours.');