
BEGIN;

-- 1. Encontrar o plano que deveria ser o C (valor 450).
-- Provavelmente ele está com o nome antigo ou desativado.
UPDATE public.plans
SET nome = 'Plano C',
    valor_padrao = 450.00,
    status = 'ativo'
WHERE nome = 'Plano B (Antigo/Descontinuado)' 
   OR nome = 'Plano B (Descontinuado)'
   OR (nome NOT IN ('Plano A', 'Plano B', 'Plano D', 'Plano Demais') AND status = 'inativo');

-- 2. Garantir que temos apenas UM de cada nome ativo.
UPDATE public.plans SET status = 'inativo' WHERE nome = 'Plano B' AND id NOT IN (SELECT id FROM public.plans WHERE nome = 'Plano B' LIMIT 1);

-- 3. Verificação final dos nomes
UPDATE public.plans SET status = 'ativo' WHERE nome IN ('Plano A', 'Plano B', 'Plano C', 'Plano D', 'Plano Demais');

COMMIT;
