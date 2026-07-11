
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
  v_counts jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.demo_batches (label, created_by)
  VALUES (_label, v_admin)
  RETURNING id INTO v_batch;

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

  -- Checklists (origem só aceita 'manual' ou 'automatico')
  INSERT INTO public.client_checklist_items (client_id, titulo, categoria, prazo, status, origem, is_demo, demo_batch_id)
  VALUES
    (v_client_comercio, 'Enviar NF-e do mês',    'fiscal',      CURRENT_DATE + 5, 'pendente', 'manual',     true, v_batch),
    (v_client_comercio, 'Pagar DAS vencido',     'fiscal',      CURRENT_DATE - 3, 'pendente', 'automatico', true, v_batch),
    (v_client_servicos, 'Folha de pagamento',    'trabalhista', CURRENT_DATE + 2, 'pendente', 'automatico', true, v_batch),
    (v_client_industria,'SPED Fiscal',           'fiscal',      CURRENT_DATE + 10,'pendente', 'automatico', true, v_batch);

  INSERT INTO public.tax_guides (client_id, titulo, tipo, valor, data_vencimento, status, is_demo, demo_batch_id)
  VALUES
    (v_client_comercio, 'DAS 05/2026',  'DAS',  250.00, CURRENT_DATE + 4, 'pendente', true, v_batch),
    (v_client_servicos, 'INSS 05/2026', 'INSS', 780.00, CURRENT_DATE - 2, 'pendente', true, v_batch);

  INSERT INTO public.notifications (user_id, title, message, is_demo, demo_batch_id)
  VALUES (v_admin, '[DEMO] Ambiente de homologação criado', 'Dados fictícios foram gerados.', true, v_batch);

  INSERT INTO public.timeline_events (client_id, event_type, actor_id, payload, is_demo, demo_batch_id)
  VALUES (v_client_comercio, 'ambiente_demo_criado', v_admin,
          jsonb_build_object('batch_id', v_batch, 'label', _label), true, v_batch);

  v_counts := jsonb_build_object(
    'clients', 3, 'checklist_items', 4, 'tax_guides', 2,
    'notifications', 1, 'timeline_events', 1
  );

  UPDATE public.demo_batches SET counts_json = v_counts, updated_at = now() WHERE id = v_batch;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'create_environment', v_batch, jsonb_build_object('label', _label, 'counts', v_counts));

  RETURN jsonb_build_object('batch_id', v_batch, 'counts', v_counts);
END $$;
