
BEGIN;

-- 1. Eliminar duplicados
DELETE FROM public.plans WHERE nome = 'Plano C' AND id NOT IN (SELECT id FROM public.plans WHERE nome = 'Plano C' LIMIT 1);
DELETE FROM public.plans WHERE nome = 'Plano D' AND id NOT IN (SELECT id FROM public.plans WHERE nome = 'Plano D' LIMIT 1);
DELETE FROM public.plans WHERE nome = 'Plano B' AND id NOT IN (SELECT id FROM public.plans WHERE nome = 'Plano B' LIMIT 1);

-- 2. Constraint UNIQUE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_nome_key') THEN
        ALTER TABLE public.plans ADD CONSTRAINT plans_nome_key UNIQUE (nome);
    END IF;
END $$;

-- 3. Upsert com tipo_cliente B2B (PJ)
INSERT INTO public.plans (nome, valor_padrao, status, limite_faturamento, descricao, tipo_cliente)
VALUES 
    ('Plano A', 180.00, 'ativo', 0, 'Plano Digital A', 'B2B'),
    ('Plano B', 300.00, 'ativo', 8400.00, 'Plano Digital B', 'B2B'),
    ('Plano C', 450.00, 'ativo', 15000.00, 'Plano Digital C', 'B2B'),
    ('Plano D', 700.00, 'ativo', 30000.00, 'Plano Digital D', 'B2B'),
    ('Plano Demais', NULL, 'ativo', 0, 'Plano Personalizado', 'B2B')
ON CONFLICT (nome) DO UPDATE 
SET valor_padrao = EXCLUDED.valor_padrao,
    status = 'ativo',
    limite_faturamento = EXCLUDED.limite_faturamento,
    descricao = EXCLUDED.descricao,
    tipo_cliente = EXCLUDED.tipo_cliente;

-- 4. Re-vincular itens operacionais
UPDATE public.plan_items 
SET plan_id = (SELECT id FROM public.plans WHERE nome = 'Plano D' LIMIT 1)
WHERE titulo IN ('Preencher formulários para bancos', 'Certidões (Receita Federal, Estadual e Trabalhista)', 'Informes de Rendimentos para IR');

-- 5. RLS e GRANTs
DROP POLICY IF EXISTS "plans_select_all" ON public.plans;
CREATE POLICY "plans_select_all" ON public.plans FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "services_select_all" ON public.services;
CREATE POLICY "services_select_all" ON public.services FOR SELECT TO authenticated, anon USING (true);
DROP POLICY IF EXISTS "plan_items_select_all" ON public.plan_items;
CREATE POLICY "plan_items_select_all" ON public.plan_items FOR SELECT TO authenticated, anon USING (true);

GRANT SELECT ON public.plans TO anon, authenticated;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT SELECT ON public.plan_items TO anon, authenticated;

COMMIT;
