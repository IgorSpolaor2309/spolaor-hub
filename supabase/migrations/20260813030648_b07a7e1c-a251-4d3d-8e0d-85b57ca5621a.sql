-- Criação da tabela de prospecção comercial
CREATE TABLE IF NOT EXISTS public.commercial_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_origin TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    cnpj TEXT,
    ai_extracted_data JSONB,
    plan_id UUID REFERENCES public.plans(id),
    extra_service_ids UUID[] DEFAULT '{}',
    coupon_id UUID,
    original_value NUMERIC NOT NULL,
    discount_value NUMERIC DEFAULT 0,
    final_value NUMERIC NOT NULL,
    status_comercial TEXT DEFAULT 'contratação_em_andamento',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Permissões de acesso
GRANT INSERT ON public.commercial_prospects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_prospects TO authenticated;
GRANT ALL ON public.commercial_prospects TO service_role;

-- RLS
ALTER TABLE public.commercial_prospects ENABLE ROW LEVEL SECURITY;

-- Política para inserção pública (Landing Page)
CREATE POLICY "Public can insert prospects" ON public.commercial_prospects
    FOR INSERT TO anon
    WITH CHECK (true);

-- Política para equipe interna gerenciar
CREATE POLICY "Team can manage prospects" ON public.commercial_prospects
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));
