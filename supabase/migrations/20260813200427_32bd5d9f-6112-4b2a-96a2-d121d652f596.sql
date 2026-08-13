-- 1. Tabela de Contratos Comerciais
CREATE TABLE IF NOT EXISTS public.commercial_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id uuid REFERENCES public.commercial_prospects(id) ON DELETE CASCADE NOT NULL,
    plan_id uuid REFERENCES public.plans(id) NOT NULL,
    plan_value numeric(10,2) NOT NULL,
    extra_services jsonb DEFAULT '[]'::jsonb,
    applied_coupon text,
    discount_value numeric(10,2) DEFAULT 0,
    final_value numeric(10,2) NOT NULL,
    contract_data jsonb DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'aguardando_contrato' CHECK (status IN ('aguardando_contrato', 'contrato_enviado', 'contrato_assinado', 'cancelado')),
    signed_at timestamptz,
    processed_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Segurança e RLS
ALTER TABLE public.commercial_contracts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.commercial_contracts TO authenticated;
GRANT ALL ON public.commercial_contracts TO service_role;
GRANT INSERT ON public.commercial_contracts TO anon;

-- Políticas
CREATE POLICY "Collaborators can view all contracts"
ON public.commercial_contracts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));

CREATE POLICY "Collaborators can update contracts"
ON public.commercial_contracts
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));

-- 3. Função de Automação de Conversão
CREATE OR REPLACE FUNCTION public.process_signed_contract(_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contract record;
    v_prospect record;
    v_client_id uuid;
    v_company_id uuid;
    v_profile_id uuid;
    v_competence_inicio text;
BEGIN
    -- 1. Busca dados do contrato
    SELECT * INTO v_contract FROM public.commercial_contracts WHERE id = _contract_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
    IF v_contract.status != 'contrato_assinado' THEN RAISE EXCEPTION 'Contrato ainda não assinado'; END IF;
    IF v_contract.processed_at IS NOT NULL THEN RETURN jsonb_build_object('success', true, 'message', 'Contrato já processado anteriormente'); END IF;

    -- 2. Busca dados do prospect
    SELECT * INTO v_prospect FROM public.commercial_prospects WHERE id = v_contract.prospect_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Prospect não encontrado'; END IF;

    -- 3. Cria o Cliente (public.clients)
    INSERT INTO public.clients (
        razao_social,
        nome_fantasia,
        cnpj,
        email,
        telefone,
        status,
        origem_cadastro,
        tipo
    ) VALUES (
        COALESCE(v_contract.contract_data->>'razao_social', v_prospect.contact_name),
        v_contract.contract_data->>'nome_fantasia',
        v_prospect.cnpj,
        v_prospect.contact_email,
        v_prospect.contact_phone,
        'ativo',
        'Digital SC - Landing',
        'comercial'
    ) RETURNING id INTO v_client_id;

    -- 4. Cria Histórico do Plano (public.client_plan_history)
    v_competence_inicio := to_char(now(), 'YYYY-MM');
    INSERT INTO public.client_plan_history (
        client_id,
        plan_id,
        competence_inicio,
        status
    ) VALUES (
        v_client_id,
        v_contract.plan_id,
        v_competence_inicio,
        'ativo'
    );

    -- 5. Atualiza o Prospect com o Client ID gerado (Rastreabilidade)
    UPDATE public.commercial_prospects 
    SET status_comercial = 'cliente_convertido', 
        last_interaction_description = 'Conversão concluída. Cliente operacional criado.'
    WHERE id = v_contract.prospect_id;

    -- 6. Marca contrato como processado
    UPDATE public.commercial_contracts 
    SET processed_at = now() 
    WHERE id = _contract_id;

    RETURN jsonb_build_object(
        'success', true, 
        'client_id', v_client_id
    );
END;
$$;