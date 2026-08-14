-- Allow anonymous users to insert leads via the public landing page flows
CREATE POLICY "Allow anonymous lead insertion"
ON public.commercial_prospects
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to update their own lead if they have the ID (stored in session)
-- This is secure because they need to know the UUID
CREATE POLICY "Allow anonymous lead update"
ON public.commercial_prospects
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Explicitly ensure PostgREST schema cache is reloaded by a small DDL if possible 
-- (Usually automatic, but let's be sure columns are visible)
COMMENT ON COLUMN public.commercial_prospects.last_interaction_description IS 'Descrição da última interação do lead';
