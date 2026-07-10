
-- 1) Coluna visivel_cliente em client_checklist_items
ALTER TABLE public.client_checklist_items
  ADD COLUMN IF NOT EXISTS visivel_cliente boolean NOT NULL DEFAULT false;

-- Backfill: itens automáticos herdam do plano
UPDATE public.client_checklist_items ci
   SET visivel_cliente = pi.visivel_cliente
  FROM public.plan_items pi
 WHERE ci.plan_item_id = pi.id
   AND ci.visivel_cliente = false
   AND pi.visivel_cliente = true;

-- 2) Recria funções de geração para copiar visivel_cliente do plano
CREATE OR REPLACE FUNCTION public.generate_plan_checklist(_competencia text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_created int := 0; v_skipped int := 0; v_no_plan int := 0;
  r_cli record; r_it record; v_resp uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Apenas administradores podem gerar checklists' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF _competencia !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'Competência inválida (use AAAA-MM)'; END IF;

  FOR r_cli IN
    SELECT c.id AS client_id, cc.plan_id
      FROM public.clients c
      LEFT JOIN public.client_commercial cc ON cc.client_id = c.id
     WHERE c.deleted_at IS NULL AND COALESCE(c.status,'active') <> 'inactive'
  LOOP
    IF r_cli.plan_id IS NULL THEN v_no_plan := v_no_plan + 1; CONTINUE; END IF;

    SELECT col.user_id INTO v_resp
      FROM public.client_collaborators cc2
      JOIN public.collaborators col ON col.id = cc2.collaborator_id
     WHERE cc2.client_id = r_cli.client_id AND col.user_id IS NOT NULL
       AND COALESCE(col.status,'active') = 'active'
     ORDER BY cc2.created_at NULLS LAST LIMIT 1;

    FOR r_it IN
      SELECT * FROM public.plan_items WHERE plan_id = r_cli.plan_id AND ativo = true
       ORDER BY ordem, created_at
    LOOP
      BEGIN
        INSERT INTO public.client_checklist_items
          (client_id, titulo, categoria, competencia, prazo,
           responsavel_profile_id, status, plan_item_id, origem, observacao, visivel_cliente)
        VALUES (r_cli.client_id, r_it.titulo, r_it.categoria, _competencia,
                public.calc_plan_item_prazo(_competencia, r_it.prazo_tipo, r_it.prazo_valor),
                v_resp, 'pendente', r_it.id, 'automatico', r_it.descricao, r_it.visivel_cliente);
        v_created := v_created + 1;
      EXCEPTION WHEN unique_violation THEN v_skipped := v_skipped + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('competencia', _competencia, 'criados', v_created,
    'ignorados_existentes', v_skipped, 'empresas_sem_plano', v_no_plan);
END $function$;

CREATE OR REPLACE FUNCTION public.apply_plan_change(_client_id uuid, _new_plan_id uuid, _mode text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_comp text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_old_plan uuid; v_resp uuid;
  v_added int := 0; v_replaced int := 0; r_pi record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem trocar planos' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('proxima','adicionar_faltantes','substituir_pendentes') THEN
    RAISE EXCEPTION 'Modo inválido';
  END IF;

  SELECT plan_id INTO v_old_plan FROM public.client_commercial WHERE client_id = _client_id;
  UPDATE public.client_commercial SET plan_id = _new_plan_id WHERE client_id = _client_id;
  IF NOT FOUND THEN
    INSERT INTO public.client_commercial (client_id, tipo_cliente, plan_id) VALUES (_client_id, 'B2B', _new_plan_id);
  END IF;

  IF _mode <> 'proxima' THEN
    SELECT col.user_id INTO v_resp
      FROM public.client_collaborators cc JOIN public.collaborators col ON col.id = cc.collaborator_id
     WHERE cc.client_id = _client_id AND col.user_id IS NOT NULL
       AND COALESCE(col.status,'active') = 'active'
     ORDER BY cc.created_at NULLS LAST LIMIT 1;

    IF _mode = 'substituir_pendentes' THEN
      UPDATE public.client_checklist_items ci
         SET deleted_at = now(), deleted_by = auth.uid(), deleted_by_role = 'admin',
             deletion_reason = 'Substituído por troca de plano'
       WHERE ci.client_id = _client_id AND ci.competencia = v_comp
         AND ci.origem = 'automatico' AND ci.status = 'pendente' AND ci.deleted_at IS NULL
         AND ci.plan_item_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.plan_items pi WHERE pi.id = ci.plan_item_id AND pi.plan_id = _new_plan_id);
      GET DIAGNOSTICS v_replaced = ROW_COUNT;
    END IF;

    FOR r_pi IN
      SELECT * FROM public.plan_items WHERE plan_id = _new_plan_id AND ativo = true
       ORDER BY ordem, created_at
    LOOP
      BEGIN
        INSERT INTO public.client_checklist_items
          (client_id, titulo, categoria, competencia, prazo,
           responsavel_profile_id, status, plan_item_id, origem, observacao, visivel_cliente)
        VALUES (_client_id, r_pi.titulo, r_pi.categoria, v_comp,
                public.calc_plan_item_prazo(v_comp, r_pi.prazo_tipo, r_pi.prazo_valor),
                v_resp, 'pendente', r_pi.id, 'automatico', r_pi.descricao, r_pi.visivel_cliente);
        v_added := v_added + 1;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END IF;

  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  VALUES (_client_id, auth.uid(), 'plano_alterado',
    'Plano alterado' || CASE _mode
      WHEN 'proxima' THEN ' (aplicará apenas na próxima competência)'
      WHEN 'adicionar_faltantes' THEN ' — adicionados ' || v_added || ' itens faltantes'
      WHEN 'substituir_pendentes' THEN ' — ' || v_added || ' adicionados, ' || v_replaced || ' substituídos'
      END,
    jsonb_build_object('old_plan_id', v_old_plan, 'new_plan_id', _new_plan_id,
                       'modo', _mode, 'competencia', v_comp,
                       'adicionados', v_added, 'substituidos', v_replaced));

  RETURN jsonb_build_object('modo', _mode, 'competencia', v_comp,
    'adicionados', v_added, 'substituidos', v_replaced);
END $function$;

CREATE OR REPLACE FUNCTION public.apply_plan_item_to_current(_plan_item_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_comp text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_start timestamptz := clock_timestamp();
  v_analisadas int := 0; v_criados int := 0; v_ignorados int := 0; v_sem_plano int := 0;
  v_pi record; v_prazo date; r_cli record; v_resp uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta ação' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_pi FROM public.plan_items WHERE id = _plan_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item do plano não encontrado'; END IF;
  v_prazo := public.calc_plan_item_prazo(v_comp, v_pi.prazo_tipo, v_pi.prazo_valor);

  FOR r_cli IN
    SELECT c.id AS client_id, cc.plan_id FROM public.clients c
      LEFT JOIN public.client_commercial cc ON cc.client_id = c.id
     WHERE c.deleted_at IS NULL AND COALESCE(c.status,'active') <> 'inactive'
  LOOP
    v_analisadas := v_analisadas + 1;
    IF r_cli.plan_id IS NULL OR r_cli.plan_id <> v_pi.plan_id THEN
      IF r_cli.plan_id IS NULL THEN v_sem_plano := v_sem_plano + 1; END IF;
      CONTINUE;
    END IF;
    SELECT col.user_id INTO v_resp
      FROM public.client_collaborators cc2 JOIN public.collaborators col ON col.id = cc2.collaborator_id
     WHERE cc2.client_id = r_cli.client_id AND col.user_id IS NOT NULL
       AND COALESCE(col.status,'active') = 'active'
     ORDER BY cc2.created_at NULLS LAST LIMIT 1;
    BEGIN
      INSERT INTO public.client_checklist_items
        (client_id, titulo, categoria, competencia, prazo,
         responsavel_profile_id, status, plan_item_id, origem, observacao, visivel_cliente)
      VALUES (r_cli.client_id, v_pi.titulo, v_pi.categoria, v_comp, v_prazo,
              v_resp, 'pendente', v_pi.id, 'automatico', v_pi.descricao, v_pi.visivel_cliente);
      v_criados := v_criados + 1;
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (r_cli.client_id, auth.uid(), 'plano_item_aplicado',
        'Item aplicado à competência ' || v_comp || ': ' || v_pi.titulo,
        jsonb_build_object('plan_item_id', v_pi.id, 'competencia', v_comp));
    EXCEPTION WHEN unique_violation THEN v_ignorados := v_ignorados + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('competencia', v_comp, 'empresas_analisadas', v_analisadas,
    'criados', v_criados, 'ignorados', v_ignorados, 'empresas_sem_plano', v_sem_plano,
    'duracao_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::int);
END $function$;

-- 3) RLS: clientes só veem itens marcados como visíveis
DROP POLICY IF EXISTS "ccl: select por acesso ao cliente" ON public.client_checklist_items;
CREATE POLICY "ccl: select staff acesso" ON public.client_checklist_items
  FOR SELECT TO authenticated
  USING (
    user_has_client_access(auth.uid(), client_id)
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'collaborator')
      OR visivel_cliente = true
    )
  );
