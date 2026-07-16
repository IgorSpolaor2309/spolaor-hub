
-- =========================================================================
-- Fase 2: Central de Competências — ciclo de fechamento
-- =========================================================================

-- 1) Tabela principal
CREATE TABLE public.client_competences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competence text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  responsible_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_requested_at timestamptz,
  review_requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completion_notes text,
  completion_summary jsonb,
  reopened_at timestamptz,
  reopened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopen_reason text,
  awaiting_client_note text,
  awaiting_client_since timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  demo_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_competences_status_chk
    CHECK (status IN ('open','in_progress','awaiting_client','in_review','completed','reopened')),
  CONSTRAINT client_competences_comp_fmt
    CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  UNIQUE (client_id, competence)
);

CREATE INDEX idx_cc_client       ON public.client_competences(client_id);
CREATE INDEX idx_cc_comp         ON public.client_competences(competence);
CREATE INDEX idx_cc_status       ON public.client_competences(status);
CREATE INDEX idx_cc_responsible  ON public.client_competences(responsible_profile_id);
CREATE INDEX idx_cc_demo_batch   ON public.client_competences(demo_batch_id) WHERE is_demo;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_competences TO authenticated;
GRANT ALL ON public.client_competences TO service_role;

ALTER TABLE public.client_competences ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total.
CREATE POLICY "Comp: admin all" ON public.client_competences
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Colaborador/dono: apenas leitura das competências das empresas vinculadas.
-- Escrita é feita exclusivamente por funções SECURITY DEFINER.
CREATE POLICY "Comp: linked read" ON public.client_competences
  FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));

CREATE TRIGGER trg_cc_updated
  BEFORE UPDATE ON public.client_competences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 2) Função auxiliar: avaliar bloqueios e alertas
-- =========================================================================
CREATE OR REPLACE FUNCTION public.competence_evaluate(
  p_client_id uuid,
  p_competence text,
  p_phase text -- 'review' | 'complete'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date := (p_competence || '-01')::date;
  v_end   date := ((p_competence || '-01')::date + interval '1 month')::date;
  v_checklist_pend int := 0;
  v_checklist_rec  int := 0;
  v_sol_ag_cli     int := 0;
  v_guias_venc     int := 0;
  v_pend_venc      int := 0;
  v_proc_atr       int := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_alerts   jsonb := '[]'::jsonb;
BEGIN
  IF p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid competence format';
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'pendente'),
    count(*) FILTER (WHERE status = 'recebido')
  INTO v_checklist_pend, v_checklist_rec
  FROM public.client_checklist_items
  WHERE client_id = p_client_id AND competencia = p_competence AND deleted_at IS NULL;

  SELECT count(*) INTO v_sol_ag_cli
  FROM public.document_requests
  WHERE client_id = p_client_id AND competencia = p_competence
    AND deleted_at IS NULL AND status = 'aguardando_cliente';

  SELECT count(*) INTO v_guias_venc
  FROM public.tax_guides
  WHERE client_id = p_client_id AND competencia = p_competence
    AND vencimento IS NOT NULL AND vencimento < current_date
    AND status NOT IN ('pago','baixado','cancelado');

  SELECT count(*) INTO v_pend_venc
  FROM public.pending_tasks
  WHERE client_id = p_client_id AND competencia = p_competence
    AND status NOT IN ('concluida','cancelada')
    AND prazo IS NOT NULL AND prazo < current_date;

  SELECT count(*) INTO v_proc_atr
  FROM public.company_processes
  WHERE client_id = p_client_id
    AND status NOT IN ('concluido','cancelado')
    AND prazo_final IS NOT NULL AND prazo_final < current_date
    AND data_abertura < v_end
    AND (data_conclusao IS NULL OR data_conclusao >= v_start);

  IF p_phase = 'complete' THEN
    IF v_checklist_pend > 0 OR v_checklist_rec > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('code','checklist_open',
        'label', format('Checklist com %s pendente(s) e %s recebido(s) aguardando conclusão', v_checklist_pend, v_checklist_rec));
    END IF;
    IF v_sol_ag_cli > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('code','solicitacoes_aguardando_cliente',
        'label', format('%s solicitação(ões) aguardando o cliente', v_sol_ag_cli));
    END IF;
    IF v_guias_venc > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('code','guias_vencidas',
        'label', format('%s guia(s) vencida(s) sem tratamento', v_guias_venc));
    END IF;
    IF v_pend_venc > 0 THEN
      v_alerts := v_alerts || jsonb_build_object('code','pendencias_vencidas',
        'label', format('%s pendência(s) vencida(s)', v_pend_venc));
    END IF;
    IF v_proc_atr > 0 THEN
      v_alerts := v_alerts || jsonb_build_object('code','processos_atrasados',
        'label', format('%s processo(s) atrasado(s)', v_proc_atr));
    END IF;
  ELSE
    -- 'review'
    IF v_sol_ag_cli > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('code','solicitacoes_aguardando_cliente',
        'label', format('%s solicitação(ões) aguardando o cliente', v_sol_ag_cli));
    END IF;
    IF v_guias_venc > 0 THEN
      v_blockers := v_blockers || jsonb_build_object('code','guias_vencidas',
        'label', format('%s guia(s) vencida(s) sem tratamento', v_guias_venc));
    END IF;
    IF v_checklist_pend > 0 THEN
      v_alerts := v_alerts || jsonb_build_object('code','checklist_pendente',
        'label', format('%s item(ns) de checklist pendente(s)', v_checklist_pend));
    END IF;
    IF v_pend_venc > 0 THEN
      v_alerts := v_alerts || jsonb_build_object('code','pendencias_vencidas',
        'label', format('%s pendência(s) vencida(s)', v_pend_venc));
    END IF;
    IF v_proc_atr > 0 THEN
      v_alerts := v_alerts || jsonb_build_object('code','processos_atrasados',
        'label', format('%s processo(s) atrasado(s)', v_proc_atr));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'blockers', v_blockers,
    'alerts',   v_alerts,
    'counts',   jsonb_build_object(
      'checklist_pendente', v_checklist_pend,
      'checklist_recebido', v_checklist_rec,
      'solicitacoes_aguardando_cliente', v_sol_ag_cli,
      'guias_vencidas', v_guias_venc,
      'pendencias_vencidas', v_pend_venc,
      'processos_atrasados', v_proc_atr
    ),
    'phase', p_phase
  );
END $$;

REVOKE ALL ON FUNCTION public.competence_evaluate(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_evaluate(uuid, text, text) TO authenticated;

-- =========================================================================
-- 3) Helpers internos
-- =========================================================================

-- Validação de vínculo do responsável
CREATE OR REPLACE FUNCTION public._competence_validate_responsible(
  p_client_id uuid, p_profile_id uuid
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client record; v_prof record; v_linked boolean;
BEGIN
  IF p_profile_id IS NULL THEN RETURN; END IF;

  SELECT id, is_demo, demo_batch_id, owner_profile_id, status
    INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;

  SELECT id, is_demo, demo_batch_id, status FROM public.profiles
    WHERE id = p_profile_id INTO v_prof;
  IF NOT FOUND THEN RAISE EXCEPTION 'responsible profile not found'; END IF;

  IF coalesce(v_prof.status,'active') <> 'active' THEN
    RAISE EXCEPTION 'responsible profile is not active';
  END IF;

  -- Coerência demo/real
  IF coalesce(v_client.is_demo,false) <> coalesce(v_prof.is_demo,false) THEN
    RAISE EXCEPTION 'demo/real mismatch between client and responsible';
  END IF;
  IF v_client.is_demo AND v_client.demo_batch_id IS DISTINCT FROM v_prof.demo_batch_id THEN
    RAISE EXCEPTION 'responsible belongs to a different demo batch';
  END IF;

  -- Vínculo: admin, owner ou client_collaborators
  SELECT
    public.is_admin(p_profile_id)
    OR v_client.owner_profile_id = p_profile_id
    OR EXISTS (SELECT 1 FROM public.client_collaborators
                WHERE client_id = p_client_id AND collaborator_profile_id = p_profile_id)
  INTO v_linked;

  IF NOT v_linked THEN
    RAISE EXCEPTION 'responsible has no link with client';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._competence_validate_responsible(uuid, uuid) FROM PUBLIC;

-- Registrar evento na timeline (reaproveita timeline_events existente)
CREATE OR REPLACE FUNCTION public._competence_log(
  p_client_id uuid, p_actor uuid, p_tipo text, p_descricao text, p_meta jsonb
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  VALUES (p_client_id, p_actor, p_tipo, p_descricao, coalesce(p_meta, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public._competence_log(uuid, uuid, text, text, jsonb) FROM PUBLIC;

-- Verificar transição
CREATE OR REPLACE FUNCTION public._competence_check_transition(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_from, p_to) IN (
    ('open','in_progress'),
    ('open','awaiting_client'),
    ('in_progress','awaiting_client'),
    ('awaiting_client','in_progress'),
    ('in_progress','in_review'),
    ('awaiting_client','in_review'),
    ('in_review','in_progress'),
    ('in_review','completed'),
    ('completed','reopened'),
    ('reopened','in_progress'),
    ('reopened','in_review')
  );
$$;

-- =========================================================================
-- 4) RPCs de operação
-- =========================================================================

-- Iniciar competência
CREATE OR REPLACE FUNCTION public.competence_start(
  p_client_id uuid, p_competence text, p_responsible uuid DEFAULT NULL
) RETURNS public.client_competences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_client record;
  v_row public.client_competences;
  v_resp uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.user_has_client_access(v_uid, p_client_id) THEN
    RAISE EXCEPTION 'forbidden: no access to client';
  END IF;
  IF p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid competence format';
  END IF;

  SELECT id, is_demo, demo_batch_id, owner_profile_id
    INTO v_client FROM public.clients WHERE id = p_client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;

  v_resp := coalesce(p_responsible, v_client.owner_profile_id);
  IF v_resp IS NOT NULL THEN
    PERFORM public._competence_validate_responsible(p_client_id, v_resp);
  END IF;

  INSERT INTO public.client_competences (
    client_id, competence, status, responsible_profile_id,
    is_demo, demo_batch_id, created_by
  )
  VALUES (
    p_client_id, p_competence, 'open', v_resp,
    coalesce(v_client.is_demo,false), v_client.demo_batch_id, v_uid
  )
  RETURNING * INTO v_row;

  PERFORM public._competence_log(
    p_client_id, v_uid, 'competencia:iniciada',
    format('Competência %s iniciada', p_competence),
    jsonb_build_object('competence', p_competence, 'competence_id', v_row.id,
                       'responsible', v_resp, 'status', 'open')
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.competence_start(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_start(uuid, text, uuid) TO authenticated;

-- Alterar status (livre transição, exceto revisar/concluir/reabrir que têm RPCs próprias)
CREATE OR REPLACE FUNCTION public.competence_change_status(
  p_id uuid, p_new_status text, p_note text DEFAULT NULL
) RETURNS public.client_competences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.client_competences;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_row FROM public.client_competences WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'competence not found'; END IF;
  IF NOT public.user_has_client_access(v_uid, v_row.client_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Somente in_progress e awaiting_client via este endpoint (transições operacionais)
  IF p_new_status NOT IN ('in_progress','awaiting_client') THEN
    RAISE EXCEPTION 'use the specific action for status %', p_new_status;
  END IF;
  IF NOT public._competence_check_transition(v_row.status, p_new_status) THEN
    RAISE EXCEPTION 'invalid transition: % -> %', v_row.status, p_new_status;
  END IF;

  UPDATE public.client_competences
     SET status = p_new_status,
         awaiting_client_note  = CASE WHEN p_new_status = 'awaiting_client' THEN p_note ELSE NULL END,
         awaiting_client_since = CASE WHEN p_new_status = 'awaiting_client' THEN now() ELSE NULL END
   WHERE id = p_id
   RETURNING * INTO v_row;

  PERFORM public._competence_log(
    v_row.client_id, v_uid, 'competencia:status',
    format('Status alterado para %s', p_new_status),
    jsonb_build_object('competence', v_row.competence, 'competence_id', v_row.id,
                       'status', p_new_status, 'note', p_note)
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.competence_change_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_change_status(uuid, text, text) TO authenticated;

-- Enviar para revisão
CREATE OR REPLACE FUNCTION public.competence_send_to_review(
  p_id uuid, p_accepted_alerts jsonb DEFAULT '[]'::jsonb, p_justification text DEFAULT NULL
) RETURNS public.client_competences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.client_competences;
  v_eval jsonb;
  v_alerts jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_row FROM public.client_competences WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'competence not found'; END IF;
  IF NOT public.user_has_client_access(v_uid, v_row.client_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public._competence_check_transition(v_row.status, 'in_review') THEN
    RAISE EXCEPTION 'invalid transition: % -> in_review', v_row.status;
  END IF;

  v_eval := public.competence_evaluate(v_row.client_id, v_row.competence, 'review');
  IF jsonb_array_length(v_eval->'blockers') > 0 THEN
    RAISE EXCEPTION 'blocked by review checks: %', v_eval->'blockers';
  END IF;
  v_alerts := v_eval->'alerts';
  IF jsonb_array_length(v_alerts) > 0 AND (p_justification IS NULL OR length(trim(p_justification)) = 0) THEN
    RAISE EXCEPTION 'justification required to accept alerts';
  END IF;

  UPDATE public.client_competences
     SET status = 'in_review',
         review_requested_at = now(),
         review_requested_by = v_uid
   WHERE id = p_id
   RETURNING * INTO v_row;

  PERFORM public._competence_log(
    v_row.client_id, v_uid, 'competencia:revisao',
    'Competência enviada para revisão',
    jsonb_build_object('competence', v_row.competence, 'competence_id', v_row.id,
                       'alerts', v_alerts, 'accepted_alerts', p_accepted_alerts,
                       'justification', p_justification)
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.competence_send_to_review(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_send_to_review(uuid, jsonb, text) TO authenticated;

-- Concluir competência (apenas admin)
CREATE OR REPLACE FUNCTION public.competence_complete(
  p_id uuid, p_notes text DEFAULT NULL,
  p_accepted_alerts jsonb DEFAULT '[]'::jsonb, p_justification text DEFAULT NULL
) RETURNS public.client_competences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.client_competences;
  v_eval jsonb; v_alerts jsonb; v_summary jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'forbidden: admin only'; END IF;

  SELECT * INTO v_row FROM public.client_competences WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'competence not found'; END IF;
  IF NOT public._competence_check_transition(v_row.status, 'completed') THEN
    RAISE EXCEPTION 'invalid transition: % -> completed', v_row.status;
  END IF;

  v_eval := public.competence_evaluate(v_row.client_id, v_row.competence, 'complete');
  IF jsonb_array_length(v_eval->'blockers') > 0 THEN
    RAISE EXCEPTION 'blocked by completion checks: %', v_eval->'blockers';
  END IF;
  v_alerts := v_eval->'alerts';
  IF jsonb_array_length(v_alerts) > 0 AND (p_justification IS NULL OR length(trim(p_justification)) = 0) THEN
    RAISE EXCEPTION 'justification required to accept alerts';
  END IF;

  v_summary := jsonb_build_object(
    'rule_version', 'phase2.v1',
    'evaluated_at', now(),
    'counts', v_eval->'counts',
    'blockers', v_eval->'blockers',
    'alerts', v_alerts,
    'accepted_alerts', p_accepted_alerts,
    'justification', p_justification,
    'notes', p_notes
  );

  UPDATE public.client_competences
     SET status = 'completed',
         completed_at = now(),
         completed_by = v_uid,
         completion_notes = p_notes,
         completion_summary = v_summary
   WHERE id = p_id
   RETURNING * INTO v_row;

  PERFORM public._competence_log(
    v_row.client_id, v_uid, 'competencia:concluida',
    format('Competência %s concluída', v_row.competence),
    jsonb_build_object('competence', v_row.competence, 'competence_id', v_row.id,
                       'summary', v_summary)
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.competence_complete(uuid, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_complete(uuid, text, jsonb, text) TO authenticated;

-- Reabrir (apenas admin)
CREATE OR REPLACE FUNCTION public.competence_reopen(
  p_id uuid, p_reason text
) RETURNS public.client_competences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.client_competences;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'forbidden: admin only'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reopen reason is required';
  END IF;

  SELECT * INTO v_row FROM public.client_competences WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'competence not found'; END IF;
  IF NOT public._competence_check_transition(v_row.status, 'reopened') THEN
    RAISE EXCEPTION 'invalid transition: % -> reopened', v_row.status;
  END IF;

  UPDATE public.client_competences
     SET status = 'reopened',
         reopened_at = now(),
         reopened_by = v_uid,
         reopen_reason = p_reason
         -- preserva completed_at, completed_by, completion_summary
   WHERE id = p_id
   RETURNING * INTO v_row;

  PERFORM public._competence_log(
    v_row.client_id, v_uid, 'competencia:reaberta',
    format('Competência %s reaberta', v_row.competence),
    jsonb_build_object('competence', v_row.competence, 'competence_id', v_row.id,
                       'reason', p_reason)
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.competence_reopen(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_reopen(uuid, text) TO authenticated;

-- Trocar responsável
CREATE OR REPLACE FUNCTION public.competence_change_responsible(
  p_id uuid, p_new_responsible uuid
) RETURNS public.client_competences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.client_competences;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_row FROM public.client_competences WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'competence not found'; END IF;
  IF NOT public.user_has_client_access(v_uid, v_row.client_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Colaborador só pode se atribuir ele mesmo; admin pode designar qualquer vínculo.
  IF NOT public.is_admin(v_uid) AND p_new_responsible IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'forbidden: collaborators can only assign themselves';
  END IF;

  IF p_new_responsible IS NOT NULL THEN
    PERFORM public._competence_validate_responsible(v_row.client_id, p_new_responsible);
  END IF;

  UPDATE public.client_competences
     SET responsible_profile_id = p_new_responsible
   WHERE id = p_id
   RETURNING * INTO v_row;

  PERFORM public._competence_log(
    v_row.client_id, v_uid, 'competencia:responsavel',
    'Responsável da competência alterado',
    jsonb_build_object('competence', v_row.competence, 'competence_id', v_row.id,
                       'responsible', p_new_responsible)
  );
  RETURN v_row;
END $$;

REVOKE ALL ON FUNCTION public.competence_change_responsible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.competence_change_responsible(uuid, uuid) TO authenticated;

-- =========================================================================
-- 5) Integração com Central de Homologação (wipe/preview)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_demo_wipe(_batch_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted bigint; t text;
  tables text[] := ARRAY[
    'client_competences',
    'timeline_events','notifications','tax_guides','document_requests',
    'client_checklist_items','documents','company_process_steps','company_processes',
    'process_steps','process_types','plan_items','plans',
    'client_users','client_collaborators',
    'collaborators','clients',
    'user_roles','profiles'
  ];
  where_clause text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;

  PERFORM 1 FROM public.company_processes cp
    JOIN public.process_types pt ON pt.id = cp.process_type_id
    WHERE pt.is_demo = true AND coalesce(cp.is_demo,false) = false
      AND (_batch_id IS NULL OR pt.demo_batch_id = _batch_id);
  IF FOUND THEN RAISE EXCEPTION 'Contaminação detectada: processos reais vinculados a tipo de processo demo. Limpeza abortada.'; END IF;

  PERFORM 1 FROM public.client_checklist_items cci
    JOIN public.clients c ON c.id = cci.client_id
    WHERE c.is_demo = true AND coalesce(cci.is_demo,false) = false
      AND (_batch_id IS NULL OR c.demo_batch_id = _batch_id);
  IF FOUND THEN RAISE EXCEPTION 'Contaminação detectada: itens de checklist reais em empresa demo. Limpeza abortada.'; END IF;

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

  INSERT INTO public.demo_audit_log(admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'wipe', _batch_id, jsonb_build_object('deleted', v_counts));

  RETURN v_counts;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_demo_wipe_preview(_batch_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_n bigint; t text;
  tables text[] := ARRAY[
    'client_competences',
    'timeline_events','notifications','tax_guides','document_requests',
    'client_checklist_items','documents','company_process_steps','company_processes',
    'process_steps','process_types','plan_items','plans',
    'client_users','client_collaborators',
    'collaborators','clients',
    'user_roles','profiles'
  ];
  where_clause text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I %s', t, where_clause) INTO v_n;
    v_counts := v_counts || jsonb_build_object(t, v_n);
  END LOOP;
  RETURN v_counts;
END $function$;
