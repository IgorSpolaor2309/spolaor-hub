-- Reestruturação final e completa dos planos Digital SC

-- 1. Limpeza e Normalização (Garante idempotência ao renomear temporariamente)
UPDATE public.plans SET nome = 'TEMP_' || nome || '_' || id::text;

-- 2. Configuração dos Planos Alvo (A, B, C) baseados nos antigos (A, C, D)
-- Antigo A -> Novo A (MEI, R$ 180)
UPDATE public.plans 
SET nome = 'Plano A', 
    valor_padrao = 180.00, 
    limite_faturamento = 8000.00,
    publico_alvo = 'MEI',
    status = 'ativo'
WHERE nome LIKE 'TEMP_Old Plano A%';

-- Antigo C -> Novo B (R$ 450, até 15k)
UPDATE public.plans 
SET nome = 'Plano B', 
    valor_padrao = 450.00, 
    limite_faturamento = 15000.00,
    publico_alvo = 'Ideal para empresas em crescimento',
    status = 'ativo'
WHERE nome LIKE 'TEMP_Old Plano C%';

-- Antigo D -> Novo C (R$ 700, até 100k)
UPDATE public.plans 
SET nome = 'Plano C', 
    valor_padrao = 700.00, 
    limite_faturamento = 100000.00,
    publico_alvo = 'Para empresas estruturadas',
    status = 'ativo'
WHERE nome LIKE 'TEMP_Old Plano D%';

-- 3. Inativar planos que não existem mais (Antigo B de 300 e Plano Demais)
UPDATE public.plans 
SET status = 'inativo' 
WHERE nome LIKE 'TEMP_Old Plano B%' OR nome LIKE 'TEMP_Old Plano Demais%';

-- 4. Criar o novo Plano D (R$ 1.500, até 300k)
INSERT INTO public.plans (nome, valor_padrao, limite_faturamento, publico_alvo, status, tipo_cliente, periodicidade, tipo_preco, is_demo)
VALUES ('Plano D', 1500.00, 300000.00, 'Solução completa para grandes volumes', 'ativo', 'B2B', 'mensal', 'fixo', false);

-- 5. Vincular serviços ao novo Plano D
-- Copiamos exatamente as definições do Plano C (que era o antigo D)
INSERT INTO public.plan_services (
    plan_id, service_id, tipo_inclusao, limite_quantidade, unidade_limite, 
    periodicidade_limite, valor_especifico, valor_especifico_provisorio, 
    observacoes, ordem, status
)
SELECT 
    (SELECT id FROM public.plans WHERE nome = 'Plano D' AND status = 'ativo' LIMIT 1),
    service_id, 
    tipo_inclusao, 
    limite_quantidade, 
    unidade_limite, 
    periodicidade_limite, 
    valor_especifico, 
    valor_especifico_provisorio, 
    observacoes, 
    ordem, 
    status
FROM public.plan_services
WHERE plan_id = (SELECT id FROM public.plans WHERE nome = 'Plano C' AND status = 'ativo' LIMIT 1);
