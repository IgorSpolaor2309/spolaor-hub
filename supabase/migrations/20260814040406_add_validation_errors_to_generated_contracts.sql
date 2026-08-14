ALTER TABLE public.generated_contracts ADD COLUMN IF NOT EXISTS validation_errors text[];
GRANT SELECT, INSERT, UPDATE ON public.generated_contracts TO anon, authenticated;
