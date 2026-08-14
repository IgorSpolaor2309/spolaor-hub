-- Final correction for lead tracking: ensure all interaction columns exist
ALTER TABLE public.commercial_prospects 
ADD COLUMN IF NOT EXISTS last_interaction_description TEXT;

-- Verify RLS and grants one last time for the lead management features
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_prospects TO authenticated;
GRANT ALL ON public.commercial_prospects TO service_role;
GRANT INSERT, UPDATE ON public.commercial_prospects TO anon;

-- Also ensure the history table has correct grants
GRANT SELECT, INSERT ON public.commercial_prospect_history TO authenticated;
GRANT ALL ON public.commercial_prospect_history TO service_role;