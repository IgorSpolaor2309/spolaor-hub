
-- =========================================================
-- Central de Homologação — Fase 1 (fundação)
-- =========================================================

-- 1) Tabelas de controle -----------------------------------
CREATE TABLE public.demo_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  counts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_batches TO authenticated;
GRANT ALL ON public.demo_batches TO service_role;
ALTER TABLE public.demo_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage demo_batches" ON public.demo_batches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.demo_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.demo_audit_log TO authenticated;
GRANT ALL ON public.demo_audit_log TO service_role;
ALTER TABLE public.demo_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read demo_audit_log" ON public.demo_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert demo_audit_log" ON public.demo_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) Marcação is_demo / demo_batch_id em tabelas alvo ------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','collaborators','profiles','plans','plan_items','client_checklist_items',
    'tax_guides','documents','document_requests','company_processes','company_process_steps',
    'notifications','timeline_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS demo_batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(demo_batch_id) WHERE is_demo = true',
      'idx_' || t || '_demo_batch', t);
  END LOOP;
END $$;

-- 3) RPCs administrativas ----------------------------------

-- Resumo dos dados de demonstração
CREATE OR REPLACE FUNCTION public.admin_demo_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  cnt bigint;
  t text;
  tables text[] := ARRAY[
    'clients','collaborators','profiles','plans','plan_items','client_checklist_items',
    'tax_guides','documents','document_requests','company_processes','company_process_steps',
    'notifications','timeline_events'
  ];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE is_demo = true', t) INTO cnt;
    result := result || jsonb_build_object(t, cnt);
  END LOOP;
  result := result || jsonb_build_object(
    'batches', (SELECT count(*) FROM public.demo_batches WHERE status = 'active')
  );
  RETURN result;
END $$;

-- Criação do ambiente de demonstração
CREATE OR REPLACE FUNCTION public.admin_demo_create_environment(_label text DEFAULT 'Ambiente demo')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid;
  v_admin uuid := auth.uid();
  v_client_comercio uuid;
  v_client_servicos uuid;
  v_client_industria uuid;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.demo_batches (label, created_by)
  VALUES (_label, v_admin)
  RETURNING id INTO v_batch;

  -- Empresas fictícias
  INSERT INTO public.clients (razao_social, nome_fantasia, documento, tipo, status, observacoes, is_demo, demo_batch_id, origem_cadastro)
  VALUES
    ('[DEMO] Comércio Homologação LTDA', 'Comércio Demo', '00.000.000/0001-91', 'PJ', 'active',
     'Empresa fictícia — Central de Homologação', true, v_batch, 'demo')
  RETURNING id INTO v_client_comercio;

  INSERT INTO public.clients (razao_social, nome_fantasia, documento, tipo, status, observacoes, is_demo, demo_batch_id, origem_cadastro)
  VALUES
    ('[DEMO] Serviços Homologação LTDA', 'Serviços Demo', '00.000.000/0002-72', 'PJ', 'active',
     'Empresa fictícia — Central de Homologação', true, v_batch, 'demo')
  RETURNING id INTO v_client_servicos;

  INSERT INTO public.clients (razao_social, nome_fantasia, documento, tipo, status, observacoes, is_demo, demo_batch_id, origem_cadastro)
  VALUES
    ('[DEMO] Indústria Homologação LTDA', 'Indústria Demo', '00.000.000/0003-53', 'PJ', 'active',
     'Empresa fictícia — Central de Homologação', true, v_batch, 'demo')
  RETURNING id INTO v_client_industria;

  -- Checklists de demonstração para cada empresa
  INSERT INTO public.client_checklist_items (client_id, titulo, categoria, prazo, status, is_demo, demo_batch_id, origem)
  VALUES
    (v_client_comercio, 'Enviar NF-e do mês', 'fiscal', CURRENT_DATE + 5, 'pendente', true, v_batch, 'demo'),
    (v_client_comercio, 'Pagar DAS vencido', 'fiscal', CURRENT_DATE - 3, 'pendente', true, v_batch, 'demo'),
    (v_client_servicos, 'Folha de pagamento', 'trabalhista', CURRENT_DATE + 2, 'pendente', true, v_batch, 'demo'),
    (v_client_industria, 'SPED Fiscal', 'fiscal', CURRENT_DATE + 10, 'pendente', true, v_batch, 'demo');

  -- Guias e validades
  INSERT INTO public.tax_guides (client_id, titulo, tipo, valor, data_vencimento, status, is_demo, demo_batch_id)
  VALUES
    (v_client_comercio, 'DAS 05/2026', 'DAS', 250.00, CURRENT_DATE + 4, 'pendente', true, v_batch),
    (v_client_servicos, 'INSS 05/2026', 'INSS', 780.00, CURRENT_DATE - 2, 'pendente', true, v_batch);

  -- Notificações internas (somente informativas, marcadas como demo)
  INSERT INTO public.notifications (user_id, title, message, is_demo, demo_batch_id)
  VALUES
    (v_admin, '[DEMO] Ambiente de homologação criado', 'Dados fictícios foram gerados.', true, v_batch);

  -- Timeline de auditoria (sem client_id específico)
  INSERT INTO public.timeline_events (client_id, event_type, actor_id, payload, is_demo, demo_batch_id)
  VALUES
    (v_client_comercio, 'ambiente_demo_criado', v_admin,
     jsonb_build_object('batch_id', v_batch, 'label', _label), true, v_batch);

  -- Atualiza contadores do lote
  SELECT jsonb_build_object(
    'clients', 3,
    'checklist_items', 4,
    'tax_guides', 2,
    'notifications', 1,
    'timeline_events', 1
  ) INTO v_counts;

  UPDATE public.demo_batches
    SET counts_json = v_counts, updated_at = now()
    WHERE id = v_batch;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'create_environment', v_batch, jsonb_build_object('label', _label, 'counts', v_counts));

  RETURN jsonb_build_object('batch_id', v_batch, 'counts', v_counts);
END $$;

-- Limpeza total (ou de um lote) — só afeta is_demo = true
CREATE OR REPLACE FUNCTION public.admin_demo_wipe(_batch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted bigint;
  t text;
  tables text[] := ARRAY[
    'timeline_events','notifications','company_process_steps','company_processes',
    'document_requests','documents','tax_guides','client_checklist_items','plan_items',
    'plans','collaborators','clients'
  ];
  where_clause text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DELETE FROM public.%I %s', t, where_clause);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object(t, v_deleted);
  END LOOP;

  -- Marcar lotes como limpos
  IF _batch_id IS NOT NULL THEN
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE id = _batch_id;
  ELSE
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE status = 'active';
  END IF;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'wipe', _batch_id, jsonb_build_object('deleted', v_counts));

  RETURN v_counts;
END $$;

-- Reset = wipe + create
CREATE OR REPLACE FUNCTION public.admin_demo_reset(_label text DEFAULT 'Ambiente demo')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_wiped jsonb;
  v_created jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_wiped := public.admin_demo_wipe(NULL);
  v_created := public.admin_demo_create_environment(_label);
  INSERT INTO public.demo_audit_log (admin_id, action, payload_json)
  VALUES (v_admin, 'reset', jsonb_build_object('wiped', v_wiped, 'created', v_created));
  RETURN jsonb_build_object('wiped', v_wiped, 'created', v_created);
END $$;

-- Trigger updated_at para demo_batches
CREATE OR REPLACE FUNCTION public.tg_demo_batches_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_demo_batches_updated_at
  BEFORE UPDATE ON public.demo_batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_demo_batches_updated_at();
