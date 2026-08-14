
CREATE TABLE IF NOT EXISTS public.lead_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id),
    action_type TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.lead_history TO authenticated;
GRANT ALL ON public.lead_history TO service_role;

CREATE POLICY "Authenticated can see lead history" ON public.lead_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert lead history" ON public.lead_history FOR INSERT TO authenticated WITH CHECK (true);
