
-- 1) Add is_demo/demo_batch_id to process_types and process_steps
ALTER TABLE public.process_types
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL;

ALTER TABLE public.process_steps
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_process_types_demo ON public.process_types(demo_batch_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_process_steps_demo ON public.process_steps(demo_batch_id) WHERE is_demo;

-- 2) Rewrite create env: seed process types + steps + open 2 processes via open_company_process
CREATE OR REPLACE FUNCTION public.admin_demo_create_environment(_label text DEFAULT 'Ambiente demo'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid;
  v_admin uuid := auth.uid();
  v_client_comercio uuid;
  v_client_servicos uuid;
  v_client_industria uuid;
  v_ptype_abertura uuid;
  v_ptype_alteracao uuid;
  v_proc1 uuid;
  v_proc2 uuid;
  v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.demo_batches (label, created_by) VALUES (_label, v_admin) RETURNING id INTO v_batch;

  -- Clients
  INSERT INTO public.clients (razao_social, nome_fantasia, documento, tipo, status, observacoes, is_demo, demo_batch_id, origem_cadastro)
  VALUES ('[DEMO] Comércio Homologação LTDA', 'Comércio Demo', '00.000.000/0001-91', 'PJ', 'active',
          'Empresa fictícia — Central de Homologação', true, v_batch, 'demo')
  RETURNING id INTO v_client_comercio;

  INSERT INTO public.clients (razao_social, nome_fantasia, documento, tipo, status, observacoes, is_demo, demo_batch_id, origem_cadastro)
  VALUES ('[DEMO] Serviços Homologação LTDA', 'Serviços Demo', '00.000.000/0002-72', 'PJ', 'active',
          'Empresa fictícia — Central de Homologação', true, v_batch, 'demo')
  RETURNING id INTO v_client_servicos;

  INSERT INTO public.clients (razao_social, nome_fantasia, documento, tipo, status, observacoes, is_demo, demo_batch_id, origem_cadastro)
  VALUES ('[DEMO] Indústria Homologação LTDA', 'Indústria Demo', '00.000.000/0003-53', 'PJ', 'active',
          'Empresa fictícia — Central de Homologação', true, v_batch, 'demo')
  RETURNING id INTO v_client_industria;

  -- Checklist
  INSERT INTO public.client_checklist_items (client_id, titulo, categoria, prazo, status, origem, is_demo, demo_batch_id)
  VALUES
    (v_client_comercio,  'Enviar NF-e do mês',  'fiscal',      CURRENT_DATE + 5,  'pendente', 'manual',     true, v_batch),
    (v_client_comercio,  'Pagar DAS vencido',   'fiscal',      CURRENT_DATE - 3,  'pendente', 'automatico', true, v_batch),
    (v_client_servicos,  'Folha de pagamento',  'trabalhista', CURRENT_DATE + 2,  'pendente', 'automatico', true, v_batch),
    (v_client_industria, 'SPED Fiscal',         'fiscal',      CURRENT_DATE + 10, 'pendente', 'automatico', true, v_batch);

  -- Tax guides
  INSERT INTO public.tax_guides (client_id, tipo, competencia, vencimento, valor, status, is_demo, demo_batch_id)
  VALUES
    (v_client_comercio, 'DAS',  '2026-05', CURRENT_DATE + 4, 250.00, 'gerada', true, v_batch),
    (v_client_servicos, 'INSS', '2026-05', CURRENT_DATE - 2, 780.00, 'gerada', true, v_batch);

  -- Notifications
  INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, is_demo, demo_batch_id)
  VALUES (v_admin, 'sistema', '[DEMO] Ambiente de homologação criado',
          'Dados fictícios foram gerados.', true, v_batch);

  -- Timeline
  INSERT INTO public.timeline_events (client_id, tipo, descricao, actor_profile_id, metadata, is_demo, demo_batch_id)
  VALUES (v_client_comercio, 'ambiente_demo_criado',
          'Ambiente de homologação criado pela Central',
          v_admin,
          jsonb_build_object('batch_id', v_batch, 'label', _label),
          true, v_batch);

  -- Process types (demo)
  INSERT INTO public.process_types (nome, categoria, descricao, status, ordem, is_demo, demo_batch_id)
  VALUES ('[DEMO] Abertura de Empresa', 'societario', 'Modelo de demonstração', 'ativo', 100, true, v_batch)
  RETURNING id INTO v_ptype_abertura;

  INSERT INTO public.process_types (nome, categoria, descricao, status, ordem, is_demo, demo_batch_id)
  VALUES ('[DEMO] Alteração Contratual', 'societario', 'Modelo de demonstração', 'ativo', 101, true, v_batch)
  RETURNING id INTO v_ptype_alteracao;

  -- Steps for Abertura de Empresa (4 steps)
  INSERT INTO public.process_steps (process_type_id, nome, descricao, ordem, departamento, prazo_dias, prazo_tipo, obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual, is_demo, demo_batch_id)
  VALUES
    (v_ptype_abertura, 'Coletar documentos do sócio', 'Recolher RG, CPF e comprovante', 1, 'societario',  3, 'abertura', true,  true,  true,  true, true, v_batch),
    (v_ptype_abertura, 'Consulta de viabilidade',     'Consulta na prefeitura',         2, 'societario',  5, 'abertura', true,  false, true,  true, true, v_batch),
    (v_ptype_abertura, 'Registro na Junta',           'Protocolar contrato social',     3, 'societario', 10, 'abertura', true,  true,  true,  true, true, v_batch),
    (v_ptype_abertura, 'Inscrição CNPJ',              'Emitir CNPJ',                    4, 'societario', 15, 'abertura', true,  false, true,  true, true, v_batch);

  -- Steps for Alteração Contratual (3 steps)
  INSERT INTO public.process_steps (process_type_id, nome, descricao, ordem, departamento, prazo_dias, prazo_tipo, obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual, is_demo, demo_batch_id)
  VALUES
    (v_ptype_alteracao, 'Análise da alteração', 'Revisar cláusulas',                 1, 'societario', 2, 'abertura', true, false, false, true, true, v_batch),
    (v_ptype_alteracao, 'Elaboração de aditivo', 'Elaborar minuta',                  2, 'societario', 3, 'abertura', true, true,  true,  true, true, v_batch),
    (v_ptype_alteracao, 'Protocolo na Junta',    'Registrar alteração',              3, 'societario', 7, 'abertura', true, true,  true,  true, true, v_batch);

  -- Open 2 company processes via official function, then mark as demo
  v_proc1 := public.open_company_process(v_client_comercio, v_ptype_abertura, NULL, NULL, 'media', '[DEMO] Processo de demonstração');
  v_proc2 := public.open_company_process(v_client_servicos, v_ptype_alteracao, NULL, NULL, 'media', '[DEMO] Processo de demonstração');

  UPDATE public.company_processes
     SET is_demo = true, demo_batch_id = v_batch
   WHERE id IN (v_proc1, v_proc2);
  UPDATE public.company_process_steps
     SET is_demo = true, demo_batch_id = v_batch
   WHERE company_process_id IN (v_proc1, v_proc2);

  v_counts := jsonb_build_object(
    'clients', 3, 'checklist_items', 4, 'tax_guides', 2,
    'notifications', 1, 'timeline_events', 1,
    'process_types', 2, 'process_steps', 7,
    'company_processes', 2
  );

  UPDATE public.demo_batches SET counts_json = v_counts, updated_at = now() WHERE id = v_batch;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'create_environment', v_batch, jsonb_build_object('label', _label, 'counts', v_counts));

  RETURN jsonb_build_object('batch_id', v_batch, 'counts', v_counts);
END $function$;

-- 3) Update wipe to include process_types/process_steps (delete company_processes first — already in list)
CREATE OR REPLACE FUNCTION public.admin_demo_wipe(_batch_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted bigint;
  t text;
  -- Delete order matters: company_process_steps -> company_processes -> process_steps -> process_types (FK RESTRICT)
  tables text[] := ARRAY[
    'timeline_events','notifications','company_process_steps','company_processes',
    'document_requests','documents','tax_guides','client_checklist_items','plan_items',
    'plans','process_steps','process_types','collaborators','clients'
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

  IF _batch_id IS NOT NULL THEN
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE id = _batch_id;
  ELSE
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE status = 'active';
  END IF;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'wipe', _batch_id, jsonb_build_object('deleted', v_counts));

  RETURN v_counts;
END $function$;

-- 4) Update summary to include process_types/process_steps/company_processes
CREATE OR REPLACE FUNCTION public.admin_demo_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  t text;
  v_count bigint;
  tables text[] := ARRAY[
    'clients','collaborators','plans','plan_items','client_checklist_items',
    'tax_guides','documents','document_requests','company_processes',
    'company_process_steps','process_types','process_steps',
    'notifications','timeline_events'
  ];
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE is_demo = true', t) INTO v_count;
    v_result := v_result || jsonb_build_object(t, v_count);
  END LOOP;

  SELECT count(*) INTO v_count FROM public.demo_batches WHERE status = 'active';
  v_result := v_result || jsonb_build_object('batches', v_count);

  RETURN v_result;
END $function$;
