ALTER TABLE public.connected_platforms DROP CONSTRAINT IF EXISTS connected_platforms_platform_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'connected_platforms_workspace_platform_key'
      AND conrelid = 'public.connected_platforms'::regclass
  ) THEN
    ALTER TABLE public.connected_platforms
      ADD CONSTRAINT connected_platforms_workspace_platform_key UNIQUE (workspace_id, platform);
  END IF;
END $$;