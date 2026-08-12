-- 1. Remove overly permissive SELECT policies
DROP POLICY IF EXISTS plans_select_all ON public.plans;
DROP POLICY IF EXISTS plans_select_anon ON public.plans;
DROP POLICY IF EXISTS services_select_all ON public.services;
DROP POLICY IF EXISTS services_select_anon ON public.services;
DROP POLICY IF EXISTS plan_items_select_all ON public.plan_items;

-- Authenticated users still need to read the catalog (clients see their plan)
CREATE POLICY plans_select_authenticated ON public.plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY services_select_authenticated ON public.services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_items_select_authenticated ON public.plan_items
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.plans FROM anon;
REVOKE SELECT ON public.services FROM anon;
REVOKE SELECT ON public.plan_items FROM anon;

-- 2. Safe public catalog accessors (only marketing-safe columns)
CREATE OR REPLACE FUNCTION public.get_public_plans()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(p ORDER BY p->>'nome'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', pl.id,
      'nome', pl.nome,
      'descricao', pl.descricao,
      'publico_alvo', pl.publico_alvo,
      'tipo_cliente', pl.tipo_cliente,
      'tipo_preco', pl.tipo_preco,
      'valor_padrao', pl.valor_padrao,
      'periodicidade', pl.periodicidade,
      'limite_faturamento', pl.limite_faturamento,
      'plan_services', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', ps.id,
          'tipo_inclusao', ps.tipo_inclusao,
          'service_id', ps.service_id,
          'services', jsonb_build_object(
            'id', s.id,
            'nome', s.nome,
            'categoria', s.categoria,
            'descricao', s.descricao
          )
        ) ORDER BY COALESCE(ps.ordem, 999), s.nome)
        FROM public.plan_services ps
        JOIN public.services s ON s.id = ps.service_id
        WHERE ps.plan_id = pl.id
          AND COALESCE(ps.status, 'ativo') = 'ativo'
          AND s.status = 'ativo'
      ), '[]'::jsonb)
    ) AS p
    FROM public.plans pl
    WHERE pl.status = 'ativo'
      AND COALESCE(pl.is_demo, false) = false
  ) q;
$$;

CREATE OR REPLACE FUNCTION public.get_public_services()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'categoria', s->>'nome'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', sv.id,
      'nome', sv.nome,
      'categoria', sv.categoria,
      'descricao', sv.descricao,
      'departamento', sv.departamento,
      'tipo_preco', sv.tipo_preco,
      'tipo_cobranca', sv.tipo_cobranca,
      'unidade_cobranca', sv.unidade_cobranca,
      'valor_referencia', sv.valor_referencia
    ) AS s
    FROM public.services sv
    WHERE sv.status = 'ativo'
  ) q;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_plans() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_services() TO anon, authenticated;