DELETE FROM public.removal_cases
WHERE review_id IN (
  SELECT id FROM public.reviews WHERE source = 'seed'
);

DELETE FROM public.removal_scans
WHERE workspace_id IN (
  SELECT DISTINCT workspace_id FROM public.reviews WHERE source = 'seed'
);

DELETE FROM public.ai_runs
WHERE review_id IN (
    SELECT id FROM public.reviews WHERE source = 'seed'
  )
  OR report_id IN (
    SELECT id FROM public.reports
    WHERE workspace_id IN (
      SELECT DISTINCT workspace_id FROM public.reviews WHERE source = 'seed'
    )
  );

DELETE FROM public.alerts
WHERE review_id IN (
    SELECT id FROM public.reviews WHERE source = 'seed'
  )
  OR workspace_id IN (
    SELECT DISTINCT workspace_id FROM public.reviews WHERE source = 'seed'
  );

DELETE FROM public.reports
WHERE workspace_id IN (
  SELECT DISTINCT workspace_id FROM public.reviews WHERE source = 'seed'
);

DELETE FROM public.competitors
WHERE workspace_id IN (
  SELECT DISTINCT workspace_id FROM public.reviews WHERE source = 'seed'
);

DELETE FROM public.locations
WHERE workspace_id IN (
  SELECT DISTINCT workspace_id FROM public.reviews WHERE source = 'seed'
);

DELETE FROM public.reviews WHERE source = 'seed';

ALTER TABLE public.reviews ALTER COLUMN source DROP DEFAULT;