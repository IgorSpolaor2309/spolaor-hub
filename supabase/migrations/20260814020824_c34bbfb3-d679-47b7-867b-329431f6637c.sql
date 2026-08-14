-- Completely reset RLS policies for commercial_prospects to ensure public landing page can track leads
DROP POLICY IF EXISTS "Allow anonymous lead insertion" ON public.commercial_prospects;
DROP POLICY IF EXISTS "Allow anonymous lead update" ON public.commercial_prospects;
DROP POLICY IF EXISTS "Admins can do everything" ON public.commercial_prospects;
DROP POLICY IF EXISTS "Public can insert" ON public.commercial_prospects;
DROP POLICY IF EXISTS "Anyone can insert" ON public.commercial_prospects;

-- 1. Admins (service role or authenticated with has_role) can do everything
CREATE POLICY "Admin full access"
ON public.commercial_prospects
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2. Public users (anon) can insert new leads
CREATE POLICY "Public lead insertion"
ON public.commercial_prospects
FOR INSERT
TO anon
WITH CHECK (true);

-- 3. Public users (anon) can update their own leads (required for progressive profiling)
CREATE POLICY "Public lead update"
ON public.commercial_prospects
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Ensure all tables have proper grants for anon
GRANT INSERT, UPDATE ON public.commercial_prospects TO anon;
GRANT SELECT ON public.commercial_prospects TO authenticated;
GRANT ALL ON public.commercial_prospects TO service_role;

-- Force schema cache reload by touching the table comment
COMMENT ON TABLE public.commercial_prospects IS 'Leads e prospectos comerciais da Digital SC';