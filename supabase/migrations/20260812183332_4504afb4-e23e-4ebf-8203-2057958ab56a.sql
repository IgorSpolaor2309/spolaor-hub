
BEGIN;
-- O Plano D parece não ter sido renomeado corretamente ou o filtro do teste falhou.
-- Vamos garantir que o Plano E foi renomeado para Plano D.
UPDATE public.plans 
SET nome = 'Plano D',
    valor_padrao = 700.00,
    status = 'ativo'
WHERE nome = 'Plano E' OR (nome = 'Plano D' AND valor_padrao IS NULL);

-- Garantir que todos os planos necessários estão ativos
UPDATE public.plans SET status = 'ativo' WHERE nome IN ('Plano A', 'Plano B', 'Plano C', 'Plano D', 'Plano Demais');

COMMIT;
