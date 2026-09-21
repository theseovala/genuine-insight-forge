ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_status_check;
ALTER TABLE public.scans ADD CONSTRAINT scans_status_check CHECK (status = ANY (ARRAY['queued','running','paused','retrying','completed','completed_with_warnings','failed','cancelled']));

ALTER TABLE public.scan_sources DROP CONSTRAINT IF EXISTS scan_sources_status_check;
ALTER TABLE public.scan_sources ADD CONSTRAINT scan_sources_status_check CHECK (status = ANY (ARRAY['completed','failed','skipped','not_configured','auth_required','not_supported','unavailable','approval_required','rate_limited']));