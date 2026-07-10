
-- =====================================================================
-- 1) Preview da troca de plano
-- =====================================================================
CREATE OR REPLACE FUNCTION public.preview_plan_change(
  _client_id uuid, _new_plan_id uuid, _competencia text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_plan uuid;
  v_current_items int;
  v_new_items int;
  v_adicionar int;
  v_substituir int;
  v_preservar int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem trocar planos' USING ERRCODE = '42501';
  END IF;
  IF _competencia !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Competência inválida (AAAA-MM)';
  END IF;

  SELECT plan_id INTO v_current_plan FROM public.client_commercial WHERE client_id = _client_id;

  SELECT count(*) INTO v_current_items
    FROM public.plan_items WHERE plan_id = v_current_plan AND ativo = true;
  SELECT count(*) INTO v_new_items
    FROM public.plan_items WHERE plan_id = _new_plan_id AND ativo = true;

  -- Itens do novo plano que ainda NÃO existem no checklist da competência (adicionar)
  SELECT count(*) INTO v_adicionar
    FROM public.plan_items pi
   WHERE pi.plan_id = _new_plan_id AND pi.ativo = true
     AND NOT EXISTS (
       SELECT 1 FROM public.client_checklist_items ci
        WHERE ci.client_id = _client_id
          AND ci.competencia = _competencia
          AND ci.plan_item_id = pi.id
          AND ci.deleted_at IS NULL
     );

  -- Itens automáticos pendentes do plano anterior que serão substituídos
  SELECT count(*) INTO v_substituir
    FROM public.client_checklist_items ci
   WHERE ci.client_id = _client_id
     AND ci.competencia = _competencia
     AND ci.origem = 'automatico'
     AND ci.status = 'pendente'
     AND ci.deleted_at IS NULL
     AND ci.plan_item_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.plan_items pi2
        WHERE pi2.id = ci.plan_item_id AND pi2.plan_id = _new_plan_id
     );

  -- Preservados = todos os itens da competência que NÃO serão tocados
  SELECT count(*) INTO v_preservar
    FROM public.client_checklist_items ci
   WHERE ci.client_id = _client_id
     AND ci.competencia = _competencia
     AND ci.deleted_at IS NULL
     AND NOT (
       ci.origem = 'automatico' AND ci.status = 'pendente'
       AND ci.plan_item_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.plan_items pi3 WHERE pi3.id = ci.plan_item_id AND pi3.plan_id = _new_plan_id)
     );

  RETURN jsonb_build_object(
    'plano_atual_id', v_current_plan,
    'plano_atual_itens', v_current_items,
    'plano_novo_itens', v_new_items,
    'adicionar', v_adicionar,
    'substituir', v_substituir,
    'preservar', v_preservar,
    'competencia', _competencia
  );
END $$;

REVOKE ALL ON FUNCTION public.preview_plan_change(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_plan_change(uuid, uuid, text) TO authenticated;

-- =====================================================================
-- 2) Aplicar troca de plano
-- =====================================================================
CREATE OR REPLACE FUNCTION public.apply_plan_change(
  _client_id uuid, _new_plan_id uuid, _mode text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_old_plan uuid;
  v_resp uuid;
  v_added int := 0;
  v_replaced int := 0;
  r_pi record;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem trocar planos' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('proxima','adicionar_faltantes','substituir_pendentes') THEN
    RAISE EXCEPTION 'Modo inválido';
  END IF;

  SELECT plan_id INTO v_old_plan FROM public.client_commercial WHERE client_id = _client_id;

  -- Atualiza o vínculo comercial
  UPDATE public.client_commercial SET plan_id = _new_plan_id WHERE client_id = _client_id;
  IF NOT FOUND THEN
    INSERT INTO public.client_commercial (client_id, tipo_cliente, plan_id)
    VALUES (_client_id, 'B2B', _new_plan_id);
  END IF;

  IF _mode <> 'proxima' THEN
    SELECT col.user_id INTO v_resp
      FROM public.client_collaborators cc
      JOIN public.collaborators col ON col.id = cc.collaborator_id
     WHERE cc.client_id = _client_id AND col.user_id IS NOT NULL
       AND COALESCE(col.status,'active') = 'active'
     ORDER BY cc.created_at NULLS LAST LIMIT 1;

    IF _mode = 'substituir_pendentes' THEN
      -- soft-delete pendentes automáticos do plano anterior que não existem no novo
      UPDATE public.client_checklist_items ci
         SET deleted_at = now(), deleted_by = auth.uid(), deleted_by_role = 'admin',
             deletion_reason = 'Substituído por troca de plano'
       WHERE ci.client_id = _client_id
         AND ci.competencia = v_comp
         AND ci.origem = 'automatico'
         AND ci.status = 'pendente'
         AND ci.deleted_at IS NULL
         AND ci.plan_item_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.plan_items pi WHERE pi.id = ci.plan_item_id AND pi.plan_id = _new_plan_id
         );
      GET DIAGNOSTICS v_replaced = ROW_COUNT;
    END IF;

    -- Adicionar itens do novo plano que ainda não existem
    FOR r_pi IN
      SELECT * FROM public.plan_items
       WHERE plan_id = _new_plan_id AND ativo = true
       ORDER BY ordem, created_at
    LOOP
      BEGIN
        INSERT INTO public.client_checklist_items
          (client_id, titulo, categoria, competencia, prazo,
           responsavel_profile_id, status, plan_item_id, origem, observacao)
        VALUES
          (_client_id, r_pi.titulo, r_pi.categoria, v_comp,
           public.calc_plan_item_prazo(v_comp, r_pi.prazo_tipo, r_pi.prazo_valor),
           v_resp, 'pendente', r_pi.id, 'automatico', r_pi.descricao);
        v_added := v_added + 1;
      EXCEPTION WHEN unique_violation THEN
        -- já existe (idempotente)
        NULL;
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

  RETURN jsonb_build_object(
    'modo', _mode, 'competencia', v_comp,
    'adicionados', v_added, 'substituidos', v_replaced
  );
END $$;

REVOKE ALL ON FUNCTION public.apply_plan_change(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_plan_change(uuid, uuid, text) TO authenticated;

-- =====================================================================
-- 3) Aplicar item do plano à competência atual em todas as empresas
-- =====================================================================
CREATE OR REPLACE FUNCTION public.apply_plan_item_to_current(_plan_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_start timestamptz := clock_timestamp();
  v_analisadas int := 0;
  v_criados int := 0;
  v_ignorados int := 0;
  v_sem_plano int := 0;
  v_pi record;
  v_prazo date;
  r_cli record;
  v_resp uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar esta ação' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pi FROM public.plan_items WHERE id = _plan_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item do plano não encontrado';
  END IF;
  v_prazo := public.calc_plan_item_prazo(v_comp, v_pi.prazo_tipo, v_pi.prazo_valor);

  FOR r_cli IN
    SELECT c.id AS client_id, cc.plan_id
      FROM public.clients c
      LEFT JOIN public.client_commercial cc ON cc.client_id = c.id
     WHERE c.deleted_at IS NULL AND COALESCE(c.status,'active') <> 'inactive'
  LOOP
    v_analisadas := v_analisadas + 1;
    IF r_cli.plan_id IS NULL OR r_cli.plan_id <> v_pi.plan_id THEN
      IF r_cli.plan_id IS NULL THEN v_sem_plano := v_sem_plano + 1; END IF;
      CONTINUE;
    END IF;

    SELECT col.user_id INTO v_resp
      FROM public.client_collaborators cc2
      JOIN public.collaborators col ON col.id = cc2.collaborator_id
     WHERE cc2.client_id = r_cli.client_id AND col.user_id IS NOT NULL
       AND COALESCE(col.status,'active') = 'active'
     ORDER BY cc2.created_at NULLS LAST LIMIT 1;

    BEGIN
      INSERT INTO public.client_checklist_items
        (client_id, titulo, categoria, competencia, prazo,
         responsavel_profile_id, status, plan_item_id, origem, observacao)
      VALUES
        (r_cli.client_id, v_pi.titulo, v_pi.categoria, v_comp, v_prazo,
         v_resp, 'pendente', v_pi.id, 'automatico', v_pi.descricao);
      v_criados := v_criados + 1;
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (r_cli.client_id, auth.uid(), 'plano_item_aplicado',
              'Item aplicado à competência ' || v_comp || ': ' || v_pi.titulo,
              jsonb_build_object('plan_item_id', v_pi.id, 'competencia', v_comp));
    EXCEPTION WHEN unique_violation THEN
      v_ignorados := v_ignorados + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'competencia', v_comp,
    'empresas_analisadas', v_analisadas,
    'criados', v_criados,
    'ignorados', v_ignorados,
    'empresas_sem_plano', v_sem_plano,
    'duracao_ms', EXTRACT(MILLISECONDS FROM (clock_timestamp() - v_start))::int
  );
END $$;

REVOKE ALL ON FUNCTION public.apply_plan_item_to_current(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_plan_item_to_current(uuid) TO authenticated;

-- =====================================================================
-- 4) Auditoria consolidada em client_checklist_items
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_checklist_item_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF public.is_admin(v_uid) THEN v_role := 'admin';
  ELSIF public.has_role(v_uid, 'collaborator') THEN v_role := 'colaborador';
  ELSIF v_uid IS NULL THEN v_role := 'cron';
  ELSE v_role := 'cliente';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, v_uid,
      CASE WHEN NEW.origem = 'automatico' THEN 'checklist_item_gerado' ELSE 'checklist_item_criado' END,
      COALESCE(NEW.titulo,'Item') || ' (' || COALESCE(NEW.competencia,'—') || ')',
      jsonb_build_object('item_id', NEW.id, 'origem', NEW.origem, 'origem_ator', v_role,
                         'plan_item_id', NEW.plan_item_id, 'competencia', NEW.competencia));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Exclusão (soft-delete já tratada por audit_soft_delete, evitar duplicar)
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RETURN NEW;
    END IF;

    -- Vínculo de documento (evento consolidado — o upload não gera outro)
    IF NEW.document_id IS DISTINCT FROM OLD.document_id AND NEW.document_id IS NOT NULL THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, v_uid, 'checklist_item_documento',
        'Documento vinculado a "' || COALESCE(NEW.titulo,'item') || '"',
        jsonb_build_object('item_id', NEW.id, 'document_id', NEW.document_id, 'origem_ator', v_role));
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, v_uid, 'checklist_item_status',
        COALESCE(NEW.titulo,'item') || ' → ' || NEW.status,
        jsonb_build_object('item_id', NEW.id, 'old', OLD.status, 'new', NEW.status, 'origem_ator', v_role));
    END IF;

    IF NEW.prazo IS DISTINCT FROM OLD.prazo THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, v_uid, 'checklist_item_prazo',
        'Prazo de "' || COALESCE(NEW.titulo,'item') || '" alterado',
        jsonb_build_object('item_id', NEW.id, 'old', OLD.prazo, 'new', NEW.prazo, 'origem_ator', v_role));
    END IF;

    IF NEW.responsavel_profile_id IS DISTINCT FROM OLD.responsavel_profile_id THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, v_uid, 'checklist_item_responsavel',
        'Responsável de "' || COALESCE(NEW.titulo,'item') || '" alterado',
        jsonb_build_object('item_id', NEW.id, 'old', OLD.responsavel_profile_id,
                           'new', NEW.responsavel_profile_id, 'origem_ator', v_role));
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_checklist_item_change ON public.client_checklist_items;
CREATE TRIGGER trg_log_checklist_item_change
AFTER INSERT OR UPDATE ON public.client_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.log_checklist_item_change();

-- =====================================================================
-- 5) Auditoria em plan_items (alteração de item do plano)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.log_plan_item_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_name text;
BEGIN
  SELECT nome INTO v_plan_name FROM public.plans WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);
  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  SELECT c.id, auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'plano_item_criado'
               WHEN 'UPDATE' THEN 'plano_item_alterado'
               WHEN 'DELETE' THEN 'plano_item_removido' END,
    'Plano "' || COALESCE(v_plan_name,'—') || '": item ' ||
      CASE TG_OP WHEN 'INSERT' THEN 'criado' WHEN 'UPDATE' THEN 'alterado' ELSE 'removido' END ||
      ' — ' || COALESCE(NEW.titulo, OLD.titulo, ''),
    jsonb_build_object('plan_item_id', COALESCE(NEW.id, OLD.id),
                       'plan_id', COALESCE(NEW.plan_id, OLD.plan_id))
  FROM public.clients c
  JOIN public.client_commercial cc ON cc.client_id = c.id
  WHERE cc.plan_id = COALESCE(NEW.plan_id, OLD.plan_id)
    AND c.deleted_at IS NULL;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_log_plan_item_change ON public.plan_items;
CREATE TRIGGER trg_log_plan_item_change
AFTER INSERT OR UPDATE OR DELETE ON public.plan_items
FOR EACH ROW EXECUTE FUNCTION public.log_plan_item_change();
