-- FASE S2 — matriz plano x serviço
ALTER TABLE public.plan_items
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.plan_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  tipo_inclusao text NOT NULL CHECK (tipo_inclusao = ANY (ARRAY['incluido','incluido_com_limite','cobrado_a_parte','sob_orcamento','indisponivel'])),
  limite_quantidade integer,
  unidade_limite text,
  periodicidade_limite text CHECK (periodicidade_limite IS NULL OR periodicidade_limite = ANY (ARRAY['mensal','trimestral','semestral','anual','unico'])),
  valor_especifico numeric,
  valor_especifico_provisorio boolean NOT NULL DEFAULT true,
  observacoes text,
  ordem integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo' CHECK (status = ANY (ARRAY['ativo','inativo'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_services_plan_service_key UNIQUE (plan_id, service_id),
  CONSTRAINT plan_services_limite_check CHECK (
    (tipo_inclusao = 'incluido_com_limite' AND limite_quantidade IS NOT NULL AND limite_quantidade > 0)
    OR (tipo_inclusao <> 'incluido_com_limite')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_services TO authenticated;
GRANT ALL ON public.plan_services TO service_role;
ALTER TABLE public.plan_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_services_select_staff ON public.plan_services;
CREATE POLICY plan_services_select_staff ON public.plan_services FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'collaborator'::app_role));
DROP POLICY IF EXISTS plan_services_admin_insert ON public.plan_services;
CREATE POLICY plan_services_admin_insert ON public.plan_services FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS plan_services_admin_update ON public.plan_services;
CREATE POLICY plan_services_admin_update ON public.plan_services FOR UPDATE TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS plan_services_admin_delete ON public.plan_services;
CREATE POLICY plan_services_admin_delete ON public.plan_services FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

DROP TRIGGER IF EXISTS plan_services_set_updated_at ON public.plan_services;
CREATE TRIGGER plan_services_set_updated_at BEFORE UPDATE ON public.plan_services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS plan_services_plan_id_idx ON public.plan_services(plan_id);
CREATE INDEX IF NOT EXISTS plan_services_service_id_idx ON public.plan_services(service_id);