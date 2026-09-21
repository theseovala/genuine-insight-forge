CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  title text NOT NULL,
  message text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read notifications" ON public.notifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = notifications.workspace_id AND m.user_id = auth.uid())
    AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "Workspace members update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = notifications.workspace_id AND m.user_id = auth.uid())
    AND (user_id IS NULL OR user_id = auth.uid()));
CREATE POLICY "Workspace members delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = notifications.workspace_id AND m.user_id = auth.uid())
    AND (user_id IS NULL OR user_id = auth.uid()));
CREATE INDEX idx_notifications_workspace ON public.notifications (workspace_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications (workspace_id, read_at) WHERE read_at IS NULL;

CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification preferences" ON public.notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.language_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en',
  locale text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.language_settings TO authenticated;
GRANT ALL ON public.language_settings TO service_role;
ALTER TABLE public.language_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own language settings" ON public.language_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER language_settings_updated_at BEFORE UPDATE ON public.language_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();