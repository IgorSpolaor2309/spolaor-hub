
-- Eventos administrativos globais podem não ter cliente vinculado.
ALTER TABLE public.timeline_events ALTER COLUMN client_id DROP NOT NULL;

-- =========================================================================
-- Duplicar modelo de processo (independente, sem processos/histórico)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_duplicate_process_type(
  _source uuid,
  _nome text,
  _descricao text DEFAULT NULL,
  _status text DEFAULT 'ativo'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new uuid;
  v_step_map jsonb := '{}'::jsonb;
  r_step record;
  v_new_step uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem duplicar modelos' USING ERRCODE = '42501';
  END IF;
  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Nome do novo modelo é obrigatório';
  END IF;

  INSERT INTO public.process_types (nome, descricao, categoria, cor, icone, status, ordem)
  SELECT btrim(_nome), COALESCE(_descricao, descricao), categoria, cor, icone,
         COALESCE(_status, 'ativo'), ordem
    FROM public.process_types WHERE id = _source
  RETURNING id INTO v_new;

  IF v_new IS NULL THEN RAISE EXCEPTION 'Modelo de origem não encontrado'; END IF;

  FOR r_step IN
    SELECT * FROM public.process_steps
     WHERE process_type_id = _source
     ORDER BY ordem, created_at
  LOOP
    INSERT INTO public.process_steps (
      process_type_id, nome, descricao, ordem, departamento,
      prazo_dias, prazo_tipo, responsavel_padrao_id,
      obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
      nome_publico, descricao_publica, observacao_publica
    )
    VALUES (
      v_new, r_step.nome, r_step.descricao, r_step.ordem, r_step.departamento,
      r_step.prazo_dias, r_step.prazo_tipo, r_step.responsavel_padrao_id,
      r_step.obrigatoria, r_step.exige_documento, r_step.visivel_cliente, r_step.pode_concluir_manual,
      r_step.nome_publico, r_step.descricao_publica, r_step.observacao_publica
    )
    RETURNING id INTO v_new_step;

    INSERT INTO public.process_step_requirements (
      process_step_id, nome, descricao, observacao, obrigatorio, ordem,
      visivel_cliente, nome_publico, descricao_publica
    )
    SELECT v_new_step, nome, descricao, observacao, obrigatorio, ordem,
           visivel_cliente, nome_publico, descricao_publica
      FROM public.process_step_requirements
     WHERE process_step_id = r_step.id
     ORDER BY ordem, created_at;

    v_step_map := v_step_map || jsonb_build_object(r_step.id::text, v_new_step);
  END LOOP;

  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  VALUES (NULL, auth.uid(), 'modelo_processo_duplicado',
    'Modelo duplicado: '||btrim(_nome),
    jsonb_build_object('source_id', _source, 'new_id', v_new));

  RETURN v_new;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_duplicate_process_type(uuid, text, text, text) TO authenticated;

-- =========================================================================
-- Importar apenas visibilidade + textos públicos de outro modelo
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_import_model_config(
  _source uuid,
  _target uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_steps_updated int := 0;
  v_steps_missing int := 0;
  v_reqs_updated int := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem importar configuração' USING ERRCODE = '42501';
  END IF;
  IF _source = _target THEN
    RAISE EXCEPTION 'Origem e destino devem ser modelos diferentes';
  END IF;

  -- Atualiza etapas do destino que casam por nome (case-insensitive)
  WITH upd AS (
    UPDATE public.process_steps dst
       SET visivel_cliente    = src.visivel_cliente,
           nome_publico       = src.nome_publico,
           descricao_publica  = src.descricao_publica,
           observacao_publica = src.observacao_publica
      FROM public.process_steps src
     WHERE dst.process_type_id = _target
       AND src.process_type_id = _source
       AND lower(btrim(dst.nome)) = lower(btrim(src.nome))
     RETURNING dst.id
  ) SELECT count(*) INTO v_steps_updated FROM upd;

  -- Etapas do destino sem correspondência no origem
  SELECT count(*) INTO v_steps_missing
    FROM public.process_steps dst
   WHERE dst.process_type_id = _target
     AND NOT EXISTS (
       SELECT 1 FROM public.process_steps src
        WHERE src.process_type_id = _source
          AND lower(btrim(src.nome)) = lower(btrim(dst.nome))
     );

  -- Atualiza requisitos casando por (nome da etapa, nome do requisito)
  WITH upd AS (
    UPDATE public.process_step_requirements dstr
       SET visivel_cliente    = srcr.visivel_cliente,
           nome_publico       = srcr.nome_publico,
           descricao_publica  = srcr.descricao_publica,
           obrigatorio        = srcr.obrigatorio
      FROM public.process_step_requirements srcr,
           public.process_steps dst,
           public.process_steps src
     WHERE dstr.process_step_id = dst.id
       AND srcr.process_step_id = src.id
       AND dst.process_type_id = _target
       AND src.process_type_id = _source
       AND lower(btrim(dst.nome)) = lower(btrim(src.nome))
       AND lower(btrim(dstr.nome)) = lower(btrim(srcr.nome))
     RETURNING dstr.id
  ) SELECT count(*) INTO v_reqs_updated FROM upd;

  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  VALUES (NULL, auth.uid(), 'modelo_processo_importado',
    'Configuração pública importada de outro modelo',
    jsonb_build_object(
      'source_id', _source, 'target_id', _target,
      'etapas_atualizadas', v_steps_updated,
      'etapas_sem_correspondencia', v_steps_missing,
      'requisitos_atualizados', v_reqs_updated
    ));

  RETURN jsonb_build_object(
    'etapas_atualizadas', v_steps_updated,
    'etapas_sem_correspondencia', v_steps_missing,
    'requisitos_atualizados', v_reqs_updated
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_import_model_config(uuid, uuid) TO authenticated;

-- =========================================================================
-- Estatísticas consolidadas dos modelos (para dashboard)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_process_models_stats()
RETURNS TABLE (
  process_type_id uuid,
  etapas_total int,
  etapas_publicas int,
  requisitos_total int,
  requisitos_publicos int,
  processos_ativos int,
  processos_total int,
  ultima_alteracao timestamptz,
  ultima_sincronizacao timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pt.id AS process_type_id,
    COALESCE(s.total, 0)::int,
    COALESCE(s.publicas, 0)::int,
    COALESCE(r.total, 0)::int,
    COALESCE(r.publicas, 0)::int,
    COALESCE(cp.ativos, 0)::int,
    COALESCE(cp.total, 0)::int,
    GREATEST(pt.updated_at, s.max_updated, r.max_updated) AS ultima_alteracao,
    sync.max_at AS ultima_sincronizacao
  FROM public.process_types pt
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE COALESCE(visivel_cliente,false))::int AS publicas,
           max(updated_at) AS max_updated
      FROM public.process_steps WHERE process_type_id = pt.id
  ) s ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE COALESCE(psr.visivel_cliente,false))::int AS publicas,
           max(psr.updated_at) AS max_updated
      FROM public.process_step_requirements psr
      JOIN public.process_steps ps ON ps.id = psr.process_step_id
     WHERE ps.process_type_id = pt.id
  ) r ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE status NOT IN ('concluido','cancelado'))::int AS ativos
      FROM public.company_processes WHERE process_type_id = pt.id
  ) cp ON TRUE
  LEFT JOIN LATERAL (
    SELECT max(created_at) AS max_at
      FROM public.timeline_events
     WHERE tipo = 'processo_sincronizacao_visibilidade'
       AND metadata->>'process_type_id' = pt.id::text
  ) sync ON TRUE
  WHERE public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'collaborator');
$$;

GRANT EXECUTE ON FUNCTION public.admin_process_models_stats() TO authenticated;
