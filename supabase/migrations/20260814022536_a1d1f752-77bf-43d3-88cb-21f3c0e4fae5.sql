
CREATE TYPE public.proposal_status AS ENUM ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada', 'cancelada');

CREATE TABLE public.custom_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    responsible_profile_id UUID REFERENCES public.profiles(id),
    base_plan_id UUID REFERENCES public.plans(id),
    status public.proposal_status DEFAULT 'rascunho',
    
    -- Configurações Financeiras
    monthly_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    setup_value NUMERIC(15,2) DEFAULT 0,
    discount_value NUMERIC(15,2) DEFAULT 0,
    final_monthly_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Escopo e Limites
    max_revenue NUMERIC(15,2),
    company_count INTEGER DEFAULT 1,
    branch_count INTEGER DEFAULT 0,
    employee_count INTEGER DEFAULT 0,
    
    -- Serviços (JSONB para snapshot de catálogo)
    -- Formato: [{service_id, name, value, included: boolean, notes: string, limit: string}]
    services JSONB DEFAULT '[]'::jsonb,
    
    -- Informações Adicionais
    commercial_notes TEXT,
    special_conditions TEXT,
    valid_until TIMESTAMPTZ,
    
    -- Snapshot imutável (quando aceita)
    acceptance_snapshot JSONB,
    accepted_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.proposal_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES public.custom_proposals(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES public.profiles(id),
    previous_status public.proposal_status,
    new_status public.proposal_status,
    change_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.custom_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_proposals TO authenticated;
GRANT ALL ON public.custom_proposals TO service_role;
GRANT SELECT, INSERT ON public.proposal_history TO authenticated;
GRANT ALL ON public.proposal_history TO service_role;

CREATE POLICY "Authenticated users can manage proposals" ON public.custom_proposals
    FOR ALL TO authenticated USING (true);

CREATE POLICY "Authenticated users can see history" ON public.proposal_history
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert history" ON public.proposal_history
    FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_custom_proposals_updated_at
    BEFORE UPDATE ON public.custom_proposals
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
