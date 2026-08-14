-- Seed an active contract model
INSERT INTO public.contract_models (name, version, content, status)
VALUES ('Modelo Teste Digital SC', 1, 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nContratante: {{razao_social}}\nCNPJ: {{cnpj}}\nPlano: {{plano}}\nValor: {{valor_mensal}}', 'ativo');

-- Seed a lead
INSERT INTO public.leads (name, email, cnpj, status)
VALUES ('Empresa Teste LTDA', 'teste@exemplo.com', '12.345.678/0001-99', 'novo');

-- Seed a prospect
INSERT INTO public.commercial_prospects (contact_name, contact_email, cnpj, status_comercial, final_value)
VALUES ('Empresa Teste LTDA', 'teste@exemplo.com', '12.345.678/0001-99', 'contrato_gerado', 499.00);

-- The generated_contract will be created by the server function or manually here for testing the review page
INSERT INTO public.generated_contracts (prospect_id, model_id, version, content_snapshot, status)
SELECT 
    cp.id, 
    cm.id, 
    cm.version, 
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\nContratante: Empresa Teste LTDA\nCNPJ: 12.345.678/0001-99\nPlano: Essencial\nValor: R$ 499,00', 
    'contrato_gerado'
FROM public.commercial_prospects cp, public.contract_models cm
WHERE cp.contact_email = 'teste@exemplo.com' AND cm.status = 'ativo'
LIMIT 1;

-- Grant access to anon for reading these if we want public review (but we use supabaseAdmin in server fn, so this is just to ensure table existence/data)
GRANT SELECT ON public.generated_contracts TO authenticated, service_role;
GRANT SELECT ON public.commercial_prospects TO authenticated, service_role;
GRANT SELECT ON public.contract_models TO authenticated, service_role;
