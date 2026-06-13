ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS stones_legacy jsonb;
UPDATE public.goals SET stones_legacy = stones WHERE stones_legacy IS NULL;