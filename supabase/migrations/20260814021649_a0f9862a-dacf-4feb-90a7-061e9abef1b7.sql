
-- 1. Create leads table if not exists (or ensure it's up to date)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT, -- For tracking without account
    name TEXT,
    email TEXT,
    phone TEXT,
    cnpj TEXT,
    business_type TEXT,
    city TEXT,
    estimated_revenue NUMERIC,
    interested_in_personalized_solution BOOLEAN DEFAULT FALSE,
    preferred_contact_channel TEXT, -- 'whatsapp', 'video', etc
    status TEXT DEFAULT 'novo', -- 'novo', 'em_atendimento', 'aguardando_contato', 'convertido', 'perdido'
    origin TEXT, -- 'landing_personalized', 'opening_chat', 'switching_chat', etc
    journey_data JSONB DEFAULT '{}'::jsonb,
    last_interaction_description TEXT,
    last_interaction_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ensure RLS on leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT INSERT, UPDATE ON public.leads TO anon;
GRANT ALL ON public.leads TO service_role;

-- 3. Policy for public inserts (landing/chat)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can insert leads') THEN
        CREATE POLICY "Public can insert leads" ON public.leads FOR INSERT TO anon WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can update their own leads') THEN
        CREATE POLICY "Public can update their own leads" ON public.leads FOR UPDATE TO anon USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can see leads') THEN
        CREATE POLICY "Authenticated users can see leads" ON public.leads FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- 4. Move "personalized solution" data from commercial_prospects back to leads if any
-- (This is just a safety measure for the transition)
INSERT INTO public.leads (name, email, phone, cnpj, interested_in_personalized_solution, preferred_contact_channel, status, origin, last_interaction_description, created_at)
SELECT contact_name, contact_email, contact_phone, cnpj, interested_in_personalized_solution, preferred_contact_channel, 'aguardando_contato', flow_origin, last_interaction_description, requested_personalized_at
FROM public.commercial_prospects
WHERE interested_in_personalized_solution = TRUE
ON CONFLICT DO NOTHING;

-- 5. Clean up commercial_prospects from purely "tracking" fields that don't belong to intent-to-contract
-- We keep them for now but we will stop using them for just tracking.
