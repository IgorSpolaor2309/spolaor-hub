ALTER TABLE public.commercial_prospects 
ADD COLUMN IF NOT EXISTS interested_in_personalized_solution BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT,
ADD COLUMN IF NOT EXISTS requested_personalized_at TIMESTAMPTZ;

GRANT ALL ON public.commercial_prospects TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.commercial_prospects TO authenticated;