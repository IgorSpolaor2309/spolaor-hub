-- FASE S1: campos comerciais opcionais nos planos existentes (nenhum vínculo de empresa alterado)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS publico_alvo text,
  ADD COLUMN IF NOT EXISTS limite_faturamento numeric(14,2),
  ADD COLUMN IF NOT EXISTS tipo_preco text NOT NULL DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS valor_provisorio boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS observacoes_comerciais text;

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_tipo_preco_check;
ALTER TABLE public.plans ADD CONSTRAINT plans_tipo_preco_check
  CHECK (tipo_preco IN ('fixo','sob_orcamento'));

-- Catálogo administrativo de serviços extraordinários (registro global de configuração)
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text NOT NULL DEFAULT 'Outro',
  descricao text,
  departamento text,
  tipo_preco text NOT NULL DEFAULT 'fixo',
  tipo_cobranca text NOT NULL DEFAULT 'fixo_por_servico',
  unidade_cobranca text,
  valor_referencia numeric(12,2),
  valor_provisorio boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ativo',
  ordem integer NOT NULL DEFAULT 0,
  observacoes_internas text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_tipo_preco_check CHECK (tipo_preco IN ('fixo','por_unidade','sob_orcamento')),
  CONSTRAINT services_tipo_cobranca_check CHECK (tipo_cobranca IN ('fixo_por_servico','referencia_por_servico','por_unidade')),
  CONSTRAINT services_status_check CHECK (status IN ('ativo','inativo'))
);

CREATE INDEX IF NOT EXISTS idx_services_categoria ON public.services (categoria);
CREATE INDEX IF NOT EXISTS idx_services_status ON public.services (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select_staff ON public.services;
CREATE POLICY services_select_staff ON public.services FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'collaborator'::app_role));

DROP POLICY IF EXISTS services_admin_insert ON public.services;
CREATE POLICY services_admin_insert ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS services_admin_update ON public.services;
CREATE POLICY services_admin_update ON public.services FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS services_admin_delete ON public.services;
CREATE POLICY services_admin_delete ON public.services FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_services_updated_at ON public.services;
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();