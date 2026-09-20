CREATE TABLE public.integration_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  field_key text NOT NULL,
  value_ciphertext text NOT NULL,
  masked_hint text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, field_key)
);

GRANT ALL ON public.integration_provider_credentials TO service_role;

ALTER TABLE public.integration_provider_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_integration_provider_credentials_lookup
  ON public.integration_provider_credentials (workspace_id, provider);

CREATE TRIGGER integration_provider_credentials_updated_at
  BEFORE UPDATE ON public.integration_provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();