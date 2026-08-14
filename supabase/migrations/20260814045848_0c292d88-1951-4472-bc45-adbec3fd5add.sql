ALTER TABLE public.generated_contracts
  ADD COLUMN IF NOT EXISTS validation_errors jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb;