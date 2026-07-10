
-- =========================================================
-- 1) TABLE plans
-- =========================================================
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo_cliente text NOT NULL CHECK (tipo_cliente IN ('B2B','B2C','MEI')),
  valor_padrao numeric(12,2),
  periodicidade text NOT NULL DEFAULT 'mensal' CHECK (periodicidade IN ('mensal','trimestral','semestral','anual')),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.plans TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_staff" ON public.plans FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'collaborator'));
CREATE POLICY "plans_admin_insert" ON public.plans FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "plans_admin_update" ON public.plans FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "plans_admin_delete" ON public.plans FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 2) TABLE plan_items
-- =========================================================
CREATE TABLE public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  categoria text NOT NULL DEFAULT 'outro'
    CHECK (categoria IN ('fiscal','contabil','dp','financeiro','juridico','cadastro','outro')),
  descricao text,
  prazo_tipo text NOT NULL DEFAULT 'sem_prazo'
    CHECK (prazo_tipo IN ('sem_prazo','dia_fixo','ultimo_dia','dias_apos_competencia')),
  prazo_valor int,
  competencia_aplicavel text NOT NULL DEFAULT 'todos'
    CHECK (competencia_aplicavel IN ('todos','mensal','trimestral','anual')),
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  obrigatorio boolean NOT NULL DEFAULT true,
  exige_documento boolean NOT NULL DEFAULT false,
  pode_concluir_manual boolean NOT NULL DEFAULT true,
  departamento text,
  visivel_cliente boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_items_plan_id_idx ON public.plan_items(plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_items TO authenticated;
GRANT ALL ON public.plan_items TO service_role;

ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_items_select_staff" ON public.plan_items FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'collaborator'));
CREATE POLICY "plan_items_admin_all" ON public.plan_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_plan_items_updated_at BEFORE UPDATE ON public.plan_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 3) client_commercial.plan_id + migração
-- =========================================================
ALTER TABLE public.client_commercial
  ADD COLUMN plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

CREATE INDEX client_commercial_plan_id_idx ON public.client_commercial(plan_id);

-- Migrar textos existentes para plans (um plano por texto distinto)
DO $$
DECLARE r record; v_plan_id uuid; v_tipo text;
BEGIN
  FOR r IN
    SELECT DISTINCT btrim(plano) AS nome, tipo_cliente
    FROM public.client_commercial
    WHERE plano IS NOT NULL AND btrim(plano) <> ''
  LOOP
    v_tipo := CASE WHEN r.tipo_cliente IN ('B2B','B2C','MEI') THEN r.tipo_cliente ELSE 'B2B' END;
    SELECT id INTO v_plan_id FROM public.plans
      WHERE lower(nome) = lower(r.nome) AND tipo_cliente = v_tipo LIMIT 1;
    IF v_plan_id IS NULL THEN
      INSERT INTO public.plans (nome, tipo_cliente, status, descricao)
      VALUES (r.nome, v_tipo, 'ativo', 'Migrado automaticamente')
      RETURNING id INTO v_plan_id;
    END IF;
    UPDATE public.client_commercial
       SET plan_id = v_plan_id
     WHERE btrim(plano) = r.nome
       AND tipo_cliente = r.tipo_cliente
       AND plan_id IS NULL;
  END LOOP;
END $$;

-- =========================================================
-- 4) client_checklist_items: plan_item_id + origem + unique
-- =========================================================
ALTER TABLE public.client_checklist_items
  ADD COLUMN plan_item_id uuid REFERENCES public.plan_items(id) ON DELETE SET NULL,
  ADD COLUMN origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','automatico'));

CREATE UNIQUE INDEX cci_unique_auto_per_month
  ON public.client_checklist_items (client_id, competencia, plan_item_id)
  WHERE plan_item_id IS NOT NULL AND deleted_at IS NULL;

-- =========================================================
-- 5) Helper: calcular prazo real
-- =========================================================
CREATE OR REPLACE FUNCTION public.calc_plan_item_prazo(_competencia text, _tipo text, _valor int)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE v_first date; v_last date; v_day int;
BEGIN
  IF _competencia IS NULL OR _competencia !~ '^\d{4}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  v_first := to_date(_competencia || '-01','YYYY-MM-DD');
  v_last  := (v_first + interval '1 month - 1 day')::date;
  IF _tipo = 'dia_fixo' AND _valor IS NOT NULL THEN
    v_day := LEAST(_valor, EXTRACT(day FROM v_last)::int);
    RETURN (date_trunc('month', v_first) + make_interval(days => v_day - 1))::date;
  ELSIF _tipo = 'ultimo_dia' THEN
    RETURN v_last;
  ELSIF _tipo = 'dias_apos_competencia' AND _valor IS NOT NULL THEN
    RETURN v_first + _valor;
  ELSE
    RETURN NULL;
  END IF;
END $$;

-- =========================================================
-- 6) generate_plan_checklist(_competencia)
-- =========================================================
CREATE OR REPLACE FUNCTION public.generate_plan_checklist(_competencia text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created int := 0;
  v_skipped int := 0;
  v_no_plan int := 0;
  r_cli record;
  r_it  record;
  v_resp uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    -- Permitir também execução por service_role (cron via api-key)
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas administradores podem gerar checklists' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _competencia !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Competência inválida (use AAAA-MM)';
  END IF;

  FOR r_cli IN
    SELECT c.id AS client_id, cc.plan_id
      FROM public.clients c
      LEFT JOIN public.client_commercial cc ON cc.client_id = c.id
     WHERE c.deleted_at IS NULL AND COALESCE(c.status,'active') <> 'inactive'
  LOOP
    IF r_cli.plan_id IS NULL THEN
      v_no_plan := v_no_plan + 1;
      CONTINUE;
    END IF;

    -- responsável principal (primeiro colaborador vinculado com user_id)
    SELECT col.user_id INTO v_resp
      FROM public.client_collaborators cc2
      JOIN public.collaborators col ON col.id = cc2.collaborator_id
     WHERE cc2.client_id = r_cli.client_id
       AND col.user_id IS NOT NULL
       AND COALESCE(col.status,'active') = 'active'
     ORDER BY cc2.created_at NULLS LAST
     LIMIT 1;

    FOR r_it IN
      SELECT * FROM public.plan_items
       WHERE plan_id = r_cli.plan_id AND ativo = true
       ORDER BY ordem, created_at
    LOOP
      BEGIN
        INSERT INTO public.client_checklist_items (
          client_id, titulo, categoria, competencia, prazo,
          responsavel_profile_id, status, plan_item_id, origem, observacao
        ) VALUES (
          r_cli.client_id, r_it.titulo, r_it.categoria, _competencia,
          public.calc_plan_item_prazo(_competencia, r_it.prazo_tipo, r_it.prazo_valor),
          v_resp, 'pendente', r_it.id, 'automatico', r_it.descricao
        );
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'competencia', _competencia,
    'criados', v_created,
    'ignorados_existentes', v_skipped,
    'empresas_sem_plano', v_no_plan
  );
END $$;

REVOKE ALL ON FUNCTION public.generate_plan_checklist(text) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_plan_checklist(text) TO authenticated, service_role;
