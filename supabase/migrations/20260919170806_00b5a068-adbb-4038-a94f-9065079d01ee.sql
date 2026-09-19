UPDATE public.reviews
SET reply = NULL, replied_at = NULL, replied_by = NULL, status = 'pending'
WHERE reply = 'Thank you for taking the time to share this. We are following up directly.';

UPDATE public.alerts SET resolved = false
WHERE id NOT IN (SELECT id FROM public.alerts ORDER BY created_at ASC LIMIT 2);