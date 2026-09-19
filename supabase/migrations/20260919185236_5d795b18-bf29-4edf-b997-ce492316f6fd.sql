INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT w.id, u.id, 'owner'
FROM public.workspaces w, auth.users u
WHERE w.slug = 'seovale-demo' AND u.email = 'theseovala@gmail.com'
ON CONFLICT (workspace_id, user_id) DO NOTHING;

DELETE FROM public.workspaces w
WHERE w.created_by = (SELECT id FROM auth.users WHERE email = 'theseovala@gmail.com')
  AND w.slug <> 'seovale-demo'
  AND NOT EXISTS (SELECT 1 FROM public.reviews r WHERE r.workspace_id = w.id);