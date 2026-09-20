CREATE TABLE public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  kind text not null default 'oauth2',
  status text not null default 'disconnected',
  account_ref text,
  account_label text,
  scopes text[] not null default '{}',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  api_key_ciphertext text,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

CREATE TABLE public.integration_oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state_hash text not null unique,
  payload_ciphertext text not null,
  redirect_origin text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

CREATE TABLE public.integration_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  event_type text not null,
  level text not null default 'info',
  message text not null,
  http_status integer,
  created_at timestamptz not null default now()
);

CREATE INDEX integration_connections_workspace_idx ON public.integration_connections (workspace_id);
CREATE INDEX integration_oauth_states_expiry_idx ON public.integration_oauth_states (expires_at) WHERE used_at IS NULL;
CREATE INDEX integration_events_workspace_idx ON public.integration_events (workspace_id, created_at DESC);

-- Credentials live here, so no browser-facing role may read these two tables.
GRANT ALL ON public.integration_connections TO service_role;
GRANT ALL ON public.integration_oauth_states TO service_role;
GRANT SELECT ON public.integration_events TO authenticated;
GRANT ALL ON public.integration_events TO service_role;

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read integration events" ON public.integration_events FOR SELECT TO authenticated
  USING (private.is_workspace_member(workspace_id));

CREATE TRIGGER integration_connections_updated_at BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_integration_oauth_state(_state_hash text)
RETURNS SETOF public.integration_oauth_states
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.integration_oauth_states
     SET used_at = now()
   WHERE state_hash = _state_hash
     AND used_at IS NULL
     AND expires_at > now()
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_integration_oauth_state(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_oauth_state(text) TO service_role;