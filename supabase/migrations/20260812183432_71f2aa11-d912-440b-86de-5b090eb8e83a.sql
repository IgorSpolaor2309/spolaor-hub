
BEGIN;

-- Investigar por que o "Plano C" atual está com os itens que deveriam ser do "Plano D".
-- O Plano C (Antigo D) deveria ser R$ 450.
-- O Plano D (Antigo E) deveria ser R$ 700.

-- 1. Identificar o Plano D que sumiu ou não foi renomeado.
-- Se o Plano C atual tem o item "Preencher formulários para bancos", ele era o antigo E.
UPDATE public.plans
SET nome = 'Plano D',
    valor_padrao = 700.00
WHERE nome = 'Plano C' AND id IN (
    SELECT plan_id FROM public.plan_items WHERE titulo = 'Preencher formulários para bancos'
);

-- 2. Corrigir o Plano C (Antigo D) caso ele tenha ficado com nome antigo ou valor errado.
UPDATE public.plans
SET nome = 'Plano C',
    valor_padrao = 450.00
WHERE (nome = 'Plano D' AND valor_padrao = 450.00) OR (nome = 'Plano C' AND valor_padrao IS NULL);

-- 3. Garantir consistência dos nomes e status
UPDATE public.plans SET status = 'ativo' WHERE nome IN ('Plano A', 'Plano B', 'Plano C', 'Plano D', 'Plano Demais');

COMMIT;
