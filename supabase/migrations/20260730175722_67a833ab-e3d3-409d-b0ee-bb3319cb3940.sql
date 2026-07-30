DO $$
DECLARE
  v_pattern text := '^(portal5|f6|cpend|f7|crq|docws|procrls|procconc|intcli|cc)-ms[0-9a-z]{6,8}-[0-9a-z]{4}';
  v_ids uuid[];
  v_clients int; v_reqs int; v_docs int; v_drf int;
  v_real_before int; v_real_after int;
  v_bad int;
BEGIN
  -- IDs confirmados: nome gerado pelo algoritmo das suítes + sem CNPJ + criados na janela dos testes + não Demo
  SELECT array_agg(id) INTO v_ids
  FROM public.clients
  WHERE razao_social ~ v_pattern
    AND documento IS NULL
    AND is_demo = false
    AND deleted_at IS NULL
    AND created_at >= '2026-07-29 00:00:00+00';

  IF v_ids IS NULL THEN
    RAISE NOTICE 'Nada a remover.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_real_before FROM public.clients;

  -- Invariante 1: nenhuma empresa legítima na lista
  SELECT count(*) INTO v_bad FROM public.clients
  WHERE id = ANY(v_ids) AND (documento IS NOT NULL OR is_demo OR razao_social !~ v_pattern);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Invariante 1 falhou: empresa legítima na lista (%).', v_bad; END IF;

  -- Invariante 2: nenhuma empresa da lista tem conta de usuário, colaborador, plano ou dado comercial/fiscal real
  SELECT count(*) INTO v_bad FROM (
    SELECT 1 FROM public.client_users WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.client_collaborators WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.client_commercial WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.client_fiscal_data WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.client_competences WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.company_processes WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.tax_guides WHERE client_id = ANY(v_ids)
    UNION ALL SELECT 1 FROM public.chat_conversations WHERE client_id = ANY(v_ids)
  ) x;
  IF v_bad > 0 THEN RAISE EXCEPTION 'Invariante 2 falhou: vínculos inesperados (%).', v_bad; END IF;

  -- Invariante 3: nenhum documento/solicitação da lista está referenciado por dados de empresas reais
  SELECT count(*) INTO v_bad
  FROM public.client_checklist_items ci
  WHERE (ci.document_id IN (SELECT id FROM public.documents WHERE client_id = ANY(v_ids))
      OR ci.document_request_id IN (SELECT id FROM public.document_requests WHERE client_id = ANY(v_ids)))
    AND ci.client_id <> ALL(v_ids);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Invariante 3 falhou: referência cruzada com empresa real (%).', v_bad; END IF;

  -- Contagens antes da exclusão
  SELECT count(*) INTO v_clients FROM public.clients WHERE id = ANY(v_ids);
  SELECT count(*) INTO v_reqs FROM public.document_requests WHERE client_id = ANY(v_ids);
  SELECT count(*) INTO v_docs FROM public.documents WHERE client_id = ANY(v_ids);
  SELECT count(*) INTO v_drf FROM public.document_request_files
   WHERE document_request_id IN (SELECT id FROM public.document_requests WHERE client_id = ANY(v_ids));

  -- Suspensão temporária dos gatilhos anti-hard-delete (restaurada nesta mesma transação)
  ALTER TABLE public.document_request_files DISABLE TRIGGER trg_drf_block_delete;
  ALTER TABLE public.documents DISABLE TRIGGER trg_documents_block_hard_delete;
  ALTER TABLE public.documents DISABLE TRIGGER trg_documents_soft_delete;
  ALTER TABLE public.document_requests DISABLE TRIGGER trg_audit_soft_delete;

  DELETE FROM public.document_request_files
   WHERE document_request_id IN (SELECT id FROM public.document_requests WHERE client_id = ANY(v_ids));
  DELETE FROM public.document_requests WHERE client_id = ANY(v_ids);
  DELETE FROM public.documents WHERE client_id = ANY(v_ids);
  DELETE FROM public.clients WHERE id = ANY(v_ids);

  ALTER TABLE public.document_request_files ENABLE TRIGGER trg_drf_block_delete;
  ALTER TABLE public.documents ENABLE TRIGGER trg_documents_block_hard_delete;
  ALTER TABLE public.documents ENABLE TRIGGER trg_documents_soft_delete;
  ALTER TABLE public.document_requests ENABLE TRIGGER trg_audit_soft_delete;

  -- Verificações pós-limpeza
  SELECT count(*) INTO v_real_after FROM public.clients;
  IF v_real_after <> v_real_before - v_clients THEN
    RAISE EXCEPTION 'Verificação falhou: empresas removidas (%) divergem do esperado (%).', v_real_before - v_real_after, v_clients;
  END IF;

  IF EXISTS (SELECT 1 FROM public.clients WHERE nome_fantasia = 'SPOLAOR CONSULT GROUP') = false THEN
    RAISE EXCEPTION 'Verificação falhou: empresa real ausente.';
  END IF;

  IF (SELECT count(*) FROM public.profiles) <> 7 OR (SELECT count(*) FROM public.collaborators) <> 6 THEN
    RAISE EXCEPTION 'Verificação falhou: perfis/colaboradores alterados.';
  END IF;

  SELECT count(*) INTO v_bad FROM public.document_requests dr
   WHERE NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = dr.client_id);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Verificação falhou: solicitações órfãs (%).', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM public.document_request_files f
   WHERE NOT EXISTS (SELECT 1 FROM public.document_requests dr WHERE dr.id = f.document_request_id);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Verificação falhou: histórico órfão (%).', v_bad; END IF;

  IF (SELECT count(*) FROM public.client_month_status) <> 0 THEN
    RAISE EXCEPTION 'Verificação falhou: client_month_status recebeu registros.';
  END IF;

  RAISE NOTICE 'Limpeza OK — empresas: %, solicitações: %, documentos: %, histórico: %', v_clients, v_reqs, v_docs, v_drf;
END $$;