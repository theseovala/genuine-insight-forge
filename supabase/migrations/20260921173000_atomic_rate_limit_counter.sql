-- Atomic rate-limit counter.
--
-- The previous implementation read the current count, added one in application
-- code and wrote the result back. Concurrent requests all read the same value
-- and all wrote the same value, so increments were lost: a measured 171
-- requests in one window advanced the counter to 39, which let the limit be
-- bypassed simply by issuing requests in parallel. That protects license
-- validation, activation, downloads and MFA verification, so the counter has to
-- be exact under concurrency.
--
-- INSERT ... ON CONFLICT DO UPDATE performs the whole read-and-increment inside
-- one statement, so the row lock serialises concurrent callers and no increment
-- can be lost.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_window_start timestamptz
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.security_rate_limits (bucket, key_hash, window_start, count)
  VALUES (p_bucket, p_key_hash, p_window_start, 1)
  ON CONFLICT (bucket, key_hash, window_start)
  DO UPDATE SET count = public.security_rate_limits.count + 1
  RETURNING count;
$$;

-- Server-side callers only. The anon and authenticated roles must never be able
-- to advance a security counter, so no grant is given to them.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, timestamptz) TO service_role;
