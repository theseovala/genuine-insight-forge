ALTER TABLE public.scans REPLICA IDENTITY FULL;
ALTER TABLE public.scan_stages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;