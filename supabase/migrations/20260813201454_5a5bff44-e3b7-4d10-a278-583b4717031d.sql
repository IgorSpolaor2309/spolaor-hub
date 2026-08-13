
-- 1. Criar ou Atualizar os Planos Oficiais A, B, C e D
-- Plano A: 180
-- Plano B: 450
-- Plano C: 700
-- Plano D: 1500 (já existe)

DO $$
DECLARE
    plan_a_id uuid;
    plan_b_id uuid;
    plan_c_id uuid;
    plan_d_id uuid;
BEGIN
    -- Obter IDs ou Inserir se não existirem
    INSERT INTO public.plans (nome, valor_padrao, status, publico_alvo, periodicidade, tipo_preco, tipo_cliente)
    VALUES ('Plano A', 180, 'ativo', 'MEI / Autônomos', 'mensal', 'fixo', 'B2B')
    ON CONFLICT (nome) DO UPDATE SET valor_padrao = 180, status = 'ativo'
    RETURNING id INTO plan_a_id;

    INSERT INTO public.plans (nome, valor_padrao, status, publico_alvo, periodicidade, tipo_preco, tipo_cliente, limite_faturamento)
    VALUES ('Plano B', 450, 'ativo', 'Faturamento até 15k', 'mensal', 'fixo', 'B2B', 15000)
    ON CONFLICT (nome) DO UPDATE SET valor_padrao = 450, status = 'ativo', limite_faturamento = 15000
    RETURNING id INTO plan_b_id;

    INSERT INTO public.plans (nome, valor_padrao, status, publico_alvo, periodicidade, tipo_preco, tipo_cliente, limite_faturamento)
    VALUES ('Plano C', 700, 'ativo', 'Faturamento até 100k', 'mensal', 'fixo', 'B2B', 100000)
    ON CONFLICT (nome) DO UPDATE SET valor_padrao = 700, status = 'ativo', limite_faturamento = 100000
    RETURNING id INTO plan_c_id;

    SELECT id INTO plan_d_id FROM public.plans WHERE nome = 'Plano D';
    IF plan_d_id IS NULL THEN
        INSERT INTO public.plans (nome, valor_padrao, status, publico_alvo, periodicidade, tipo_preco, tipo_cliente, limite_faturamento)
        VALUES ('Plano D', 1500, 'ativo', 'Faturamento até 300k', 'mensal', 'fixo', 'B2B', 300000)
        RETURNING id INTO plan_d_id;
    ELSE
        UPDATE public.plans SET valor_padrao = 1500, status = 'ativo', limite_faturamento = 300000 WHERE id = plan_d_id;
    END IF;

    -- 2. Remapear referências de planos TEMP para os oficiais correspondentes
    -- TEMP_Plano A (180) -> Plano A
    UPDATE public.commercial_prospects SET plan_id = plan_a_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano A%');
    UPDATE public.commercial_contracts SET plan_id = plan_a_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano A%');
    UPDATE public.client_plan_history SET plan_id = plan_a_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano A%');
    UPDATE public.plan_services SET plan_id = plan_a_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano A%') AND plan_id != plan_a_id;

    -- TEMP_Plano C (450) -> Plano B (Oficial 450)
    UPDATE public.commercial_prospects SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano C%');
    UPDATE public.commercial_contracts SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano C%');
    UPDATE public.client_plan_history SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano C%');
    UPDATE public.plan_services SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano C%') AND plan_id != plan_b_id;

    -- TEMP_Plano D (700) -> Plano C (Oficial 700)
    UPDATE public.commercial_prospects SET plan_id = plan_c_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano D%');
    UPDATE public.commercial_contracts SET plan_id = plan_c_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano D%');
    UPDATE public.client_plan_history SET plan_id = plan_c_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano D%');
    UPDATE public.plan_services SET plan_id = plan_c_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano D%') AND plan_id != plan_c_id;

    -- TEMP_Plano B (300) -> Como deve sumir, vamos mapear para Plano B (que é o mais próximo ou o "novo" B) 
    -- Se o usuário disse que o de 300 não existe, talvez ele queira que os leads antigos de 300 vão para o novo B de 450
    UPDATE public.commercial_prospects SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano B%');
    UPDATE public.commercial_contracts SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano B%');
    UPDATE public.client_plan_history SET plan_id = plan_b_id WHERE plan_id IN (SELECT id FROM public.plans WHERE nome LIKE 'TEMP_Plano B%');

    -- 3. Desativar Planos Temporários e o "Demais"
    UPDATE public.plans SET status = 'inativo' WHERE nome LIKE 'TEMP_%' OR nome LIKE '%Demais%';
END $$;
