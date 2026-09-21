-- Evidence package + outcome loop columns.
--
-- Five additive columns, approved explicitly. Nothing is dropped, renamed or
-- rewritten, and no existing row is touched: every statement is ADD COLUMN IF
-- NOT EXISTS, so re-running it is a no-op.
--
-- Why each one is needed:
--
--   reviews.review_url        A platform will not act on a report that does not
--                             link to the review. The URL was collected nowhere,
--                             so no evidence package could be assembled.
--
--   removal_cases.route       Which legitimate route was used (platform policy
--                             report, appeal, support escalation, legal request,
--                             regulator, court-order route, manual escalation).
--
--   removal_cases.evidence    The package itself: review URL, timestamps, the
--                             original content, screenshot reference, content
--                             hash, policy citation with its source URL and
--                             retrieval date.
--
--   removal_cases.outcome     What the platform actually did. Without this the
--   removal_cases.outcome_at  system can never measure which route, category or
--                             argument succeeds, so it can never improve.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS review_url text;

ALTER TABLE public.removal_cases
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS outcome_at timestamptz;

COMMENT ON COLUMN public.reviews.review_url IS
  'Permalink to the review on its platform. Required evidence for any report.';
COMMENT ON COLUMN public.removal_cases.route IS
  'The legitimate route this case was submitted through.';
COMMENT ON COLUMN public.removal_cases.evidence IS
  'Evidence package: review URL, timestamps, original content, screenshot ref, content hash, policy citation with source URL and retrieval date.';
COMMENT ON COLUMN public.removal_cases.outcome IS
  'What the platform actually did. Only set from a real provider response.';
COMMENT ON COLUMN public.removal_cases.outcome_at IS
  'When the outcome was recorded.';

-- Reading outcomes by route and by violation type is the whole point of the
-- loop, so the two lookups that will run on every analytics read get an index.
CREATE INDEX IF NOT EXISTS removal_cases_route_outcome_idx
  ON public.removal_cases (workspace_id, route, outcome);
CREATE INDEX IF NOT EXISTS removal_cases_violation_outcome_idx
  ON public.removal_cases (workspace_id, violation_type, outcome);
