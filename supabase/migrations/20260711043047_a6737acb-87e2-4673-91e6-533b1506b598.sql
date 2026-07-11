
-- RPC: prévia + aplicação da visibilidade pública do modelo em processos abertos.
-- Modo 'only_missing': só preenche textos NULOS e só promove visivel_cliente (false -> true) quando o modelo indica true.
-- Modo 'overwrite_all': sobrescreve tudo (incluindo textos personalizados) igualando ao modelo.
-- Ambos ignoram processos concluídos/cancelados.

CREATE OR REPLACE FUNCTION public.admin_sync_process_visibility(
  _process_type_id uuid,
  _mode text,
  _dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_steps_affected int := 0;
  v_reqs_affected int := 0;
  v_processes_affected int := 0;
  v_client_ids uuid[];
  v_cli uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem sincronizar visibilidade' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('only_missing','overwrite_all') THEN
    RAISE EXCEPTION 'Modo inválido';
  END IF;

  -- Pré-contagem (usada tanto em dry_run quanto no aplicar)
  IF _mode = 'overwrite_all' THEN
    SELECT count(*) INTO v_steps_affected
      FROM public.company_process_steps cps
      JOIN public.company_processes cp ON cp.id = cps.company_process_id
      JOIN public.process_steps ps ON ps.id = cps.process_step_id
     WHERE cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado')
       AND (
         cps.visivel_cliente     IS DISTINCT FROM COALESCE(ps.visivel_cliente,false)
         OR cps.nome_publico     IS DISTINCT FROM ps.nome_publico
         OR cps.descricao_publica IS DISTINCT FROM ps.descricao_publica
         OR cps.observacao_publica IS DISTINCT FROM ps.observacao_publica
       );

    SELECT count(*) INTO v_reqs_affected
      FROM public.company_process_step_requirements cpsr
      JOIN public.company_process_steps cps ON cps.id = cpsr.company_process_step_id
      JOIN public.company_processes cp ON cp.id = cps.company_process_id
      JOIN public.process_step_requirements psr ON psr.id = cpsr.source_requirement_id
     WHERE cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado')
       AND (
         cpsr.visivel_cliente     IS DISTINCT FROM COALESCE(psr.visivel_cliente,false)
         OR cpsr.nome_publico     IS DISTINCT FROM psr.nome_publico
         OR cpsr.descricao_publica IS DISTINCT FROM psr.descricao_publica
       );
  ELSE -- only_missing
    SELECT count(*) INTO v_steps_affected
      FROM public.company_process_steps cps
      JOIN public.company_processes cp ON cp.id = cps.company_process_id
      JOIN public.process_steps ps ON ps.id = cps.process_step_id
     WHERE cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado')
       AND (
         (cps.visivel_cliente = false AND COALESCE(ps.visivel_cliente,false) = true)
         OR (cps.nome_publico       IS NULL AND ps.nome_publico       IS NOT NULL)
         OR (cps.descricao_publica  IS NULL AND ps.descricao_publica  IS NOT NULL)
         OR (cps.observacao_publica IS NULL AND ps.observacao_publica IS NOT NULL)
       );

    SELECT count(*) INTO v_reqs_affected
      FROM public.company_process_step_requirements cpsr
      JOIN public.company_process_steps cps ON cps.id = cpsr.company_process_step_id
      JOIN public.company_processes cp ON cp.id = cps.company_process_id
      JOIN public.process_step_requirements psr ON psr.id = cpsr.source_requirement_id
     WHERE cp.status NOT IN ('concluido','cancelado')
       AND cp.process_type_id = _process_type_id
       AND (
         (cpsr.visivel_cliente = false AND COALESCE(psr.visivel_cliente,false) = true)
         OR (cpsr.nome_publico      IS NULL AND psr.nome_publico      IS NOT NULL)
         OR (cpsr.descricao_publica IS NULL AND psr.descricao_publica IS NOT NULL)
       );
  END IF;

  -- Clientes afetados (para contagem e auditoria)
  SELECT array_agg(DISTINCT cp.client_id) INTO v_client_ids
    FROM public.company_processes cp
   WHERE cp.process_type_id = _process_type_id
     AND cp.status NOT IN ('concluido','cancelado');
  v_processes_affected := COALESCE(array_length(v_client_ids,1),0);

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true, 'mode', _mode,
      'process_type_id', _process_type_id,
      'etapas_afetadas', v_steps_affected,
      'requisitos_afetados', v_reqs_affected,
      'clientes_afetados', v_processes_affected
    );
  END IF;

  -- Aplicar
  IF _mode = 'overwrite_all' THEN
    UPDATE public.company_process_steps cps
       SET visivel_cliente     = COALESCE(ps.visivel_cliente,false),
           nome_publico        = ps.nome_publico,
           descricao_publica   = ps.descricao_publica,
           observacao_publica  = ps.observacao_publica
      FROM public.process_steps ps, public.company_processes cp
     WHERE cps.process_step_id = ps.id
       AND cps.company_process_id = cp.id
       AND cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado');

    UPDATE public.company_process_step_requirements cpsr
       SET visivel_cliente    = COALESCE(psr.visivel_cliente,false),
           nome_publico       = psr.nome_publico,
           descricao_publica  = psr.descricao_publica
      FROM public.process_step_requirements psr,
           public.company_process_steps cps,
           public.company_processes cp
     WHERE cpsr.source_requirement_id = psr.id
       AND cpsr.company_process_step_id = cps.id
       AND cps.company_process_id = cp.id
       AND cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado');
  ELSE
    UPDATE public.company_process_steps cps
       SET visivel_cliente = CASE
             WHEN cps.visivel_cliente = false AND COALESCE(ps.visivel_cliente,false) = true THEN true
             ELSE cps.visivel_cliente END,
           nome_publico        = COALESCE(cps.nome_publico,        ps.nome_publico),
           descricao_publica   = COALESCE(cps.descricao_publica,   ps.descricao_publica),
           observacao_publica  = COALESCE(cps.observacao_publica,  ps.observacao_publica)
      FROM public.process_steps ps, public.company_processes cp
     WHERE cps.process_step_id = ps.id
       AND cps.company_process_id = cp.id
       AND cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado');

    UPDATE public.company_process_step_requirements cpsr
       SET visivel_cliente = CASE
             WHEN cpsr.visivel_cliente = false AND COALESCE(psr.visivel_cliente,false) = true THEN true
             ELSE cpsr.visivel_cliente END,
           nome_publico       = COALESCE(cpsr.nome_publico,      psr.nome_publico),
           descricao_publica  = COALESCE(cpsr.descricao_publica, psr.descricao_publica)
      FROM public.process_step_requirements psr,
           public.company_process_steps cps,
           public.company_processes cp
     WHERE cpsr.source_requirement_id = psr.id
       AND cpsr.company_process_step_id = cps.id
       AND cps.company_process_id = cp.id
       AND cp.process_type_id = _process_type_id
       AND cp.status NOT IN ('concluido','cancelado');
  END IF;

  -- Auditoria por cliente
  IF v_client_ids IS NOT NULL THEN
    FOREACH v_cli IN ARRAY v_client_ids LOOP
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (v_cli, auth.uid(), 'processo_sincronizacao_visibilidade',
        'Configuração pública do modelo aplicada aos processos',
        jsonb_build_object('process_type_id', _process_type_id, 'mode', _mode,
                           'etapas_afetadas', v_steps_affected,
                           'requisitos_afetados', v_reqs_affected));
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', false, 'mode', _mode,
    'process_type_id', _process_type_id,
    'etapas_afetadas', v_steps_affected,
    'requisitos_afetados', v_reqs_affected,
    'clientes_afetados', v_processes_affected
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_sync_process_visibility(uuid, text, boolean) TO authenticated;

-- Ações em lote no próprio modelo (mostrar/ocultar todas as etapas e requisitos do tipo)
CREATE OR REPLACE FUNCTION public.admin_bulk_set_model_visibility(
  _process_type_id uuid,
  _visible boolean,
  _include_requirements boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_steps int := 0; v_reqs int := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar visibilidade' USING ERRCODE = '42501';
  END IF;

  UPDATE public.process_steps SET visivel_cliente = _visible
   WHERE process_type_id = _process_type_id
     AND COALESCE(visivel_cliente,false) IS DISTINCT FROM _visible;
  GET DIAGNOSTICS v_steps = ROW_COUNT;

  IF _include_requirements THEN
    UPDATE public.process_step_requirements psr
       SET visivel_cliente = _visible
      FROM public.process_steps ps
     WHERE psr.process_step_id = ps.id
       AND ps.process_type_id = _process_type_id
       AND COALESCE(psr.visivel_cliente,false) IS DISTINCT FROM _visible;
    GET DIAGNOSTICS v_reqs = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('etapas', v_steps, 'requisitos', v_reqs, 'visivel', _visible);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_set_model_visibility(uuid, boolean, boolean) TO authenticated;
