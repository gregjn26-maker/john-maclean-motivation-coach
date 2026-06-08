ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS overall_rating TEXT NOT NULL DEFAULT '';

ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_overall_rating_chk;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_overall_rating_chk
  CHECK (overall_rating IN ('', 'hit', 'partly', 'missed'));