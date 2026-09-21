ALTER TABLE public.ai_runs DROP CONSTRAINT ai_runs_purpose_check;
ALTER TABLE public.ai_runs ADD CONSTRAINT ai_runs_purpose_check CHECK (purpose = ANY (ARRAY['reply_draft'::text,'feedback_briefing'::text,'reputation_report'::text,'scan_analysis'::text]));
ALTER TABLE public.ai_runs ALTER COLUMN model DROP NOT NULL;
ALTER TABLE public.ai_runs ALTER COLUMN user_id DROP NOT NULL;