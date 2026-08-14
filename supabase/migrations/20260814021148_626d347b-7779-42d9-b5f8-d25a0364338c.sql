-- Remove NOT NULL from financial columns to allow leads without calculated prices (personalized solution flow)
ALTER TABLE public.commercial_prospects ALTER COLUMN original_value DROP NOT NULL;
ALTER TABLE public.commercial_prospects ALTER COLUMN discount_value DROP NOT NULL;
ALTER TABLE public.commercial_prospects ALTER COLUMN final_value DROP NOT NULL;

-- Ensure contact columns are definitely NULLable (repeat for robustness)
ALTER TABLE public.commercial_prospects ALTER COLUMN contact_name DROP NOT NULL;
ALTER TABLE public.commercial_prospects ALTER COLUMN contact_email DROP NOT NULL;
ALTER TABLE public.commercial_prospects ALTER COLUMN contact_phone DROP NOT NULL;

-- Set defaults to avoid NULL where zero is better
ALTER TABLE public.commercial_prospects ALTER COLUMN original_value SET DEFAULT 0;
ALTER TABLE public.commercial_prospects ALTER COLUMN discount_value SET DEFAULT 0;
ALTER TABLE public.commercial_prospects ALTER COLUMN final_value SET DEFAULT 0;
