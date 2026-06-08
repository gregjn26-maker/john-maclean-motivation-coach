ALTER TABLE public.check_ins
  ADD COLUMN IF NOT EXISTS stone_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS nudged_stone text NOT NULL DEFAULT '';