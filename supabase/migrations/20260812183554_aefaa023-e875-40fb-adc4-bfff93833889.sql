
-- Adicionar política para permitir que qualquer usuário autenticado (incluindo clientes) visualize os planos.
-- Isso é necessário para o catálogo e para que os testes funcionem sem bypass de RLS.
CREATE POLICY "plans_select_all" ON public.plans
FOR SELECT TO authenticated
USING (true);

-- Garantir que a tabela services também tenha leitura aberta
CREATE POLICY "services_select_all" ON public.services
FOR SELECT TO authenticated
USING (true);
