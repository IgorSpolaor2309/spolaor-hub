
-- 1) Colunas de visibilidade e textos públicos
ALTER TABLE public.process_steps
  ADD COLUMN IF NOT EXISTS nome_publico text,
  ADD COLUMN IF NOT EXISTS descricao_publica text,
  ADD COLUMN IF NOT EXISTS observacao_publica text;

ALTER TABLE public.company_process_steps
  ADD COLUMN IF NOT EXISTS nome_publico text,
  ADD COLUMN IF NOT EXISTS descricao_publica text,
  ADD COLUMN IF NOT EXISTS observacao_publica text;
-- visivel_cliente já existe em process_steps/company_process_steps (fase 2)

ALTER TABLE public.process_step_requirements
  ADD COLUMN IF NOT EXISTS visivel_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nome_publico text,
  ADD COLUMN IF NOT EXISTS descricao_publica text;

ALTER TABLE public.company_process_step_requirements
  ADD COLUMN IF NOT EXISTS visivel_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nome_publico text,
  ADD COLUMN IF NOT EXISTS descricao_publica text;

-- 2) Atualiza open_company_process para copiar novos campos
CREATE OR REPLACE FUNCTION public.open_company_process(
  _client_id uuid, _process_type_id uuid,
  _responsavel_id uuid DEFAULT NULL::uuid,
  _prazo_final date DEFAULT NULL::date,
  _prioridade text DEFAULT 'media'::text,
  _observacoes text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _new_id uuid; _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.company_processes
    (client_id, process_type_id, responsavel_id, prazo_final, prioridade, observacoes, created_by)
  VALUES
    (_client_id, _process_type_id, _responsavel_id, _prazo_final,
     COALESCE(_prioridade,'media'), _observacoes, auth.uid())
  RETURNING id INTO _new_id;

  WITH inserted_steps AS (
    INSERT INTO public.company_process_steps (
      company_process_id, process_step_id, nome, descricao, ordem, departamento,
      obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
      responsavel_id, prazo, prazo_tipo, prazo_dias,
      nome_publico, descricao_publica, observacao_publica
    )
    SELECT _new_id, s.id, s.nome, s.descricao, s.ordem, s.departamento,
           s.obrigatoria, s.exige_documento, COALESCE(s.visivel_cliente,false), s.pode_concluir_manual,
           COALESCE(_responsavel_id, s.responsavel_padrao_id),
           CASE WHEN s.prazo_tipo='abertura' AND s.prazo_dias IS NOT NULL
                THEN (_hoje + (s.prazo_dias||' days')::interval)::date ELSE NULL END,
           s.prazo_tipo, s.prazo_dias,
           s.nome_publico, s.descricao_publica, s.observacao_publica
      FROM public.process_steps s
     WHERE s.process_type_id = _process_type_id
     ORDER BY s.ordem, s.created_at
    RETURNING id, process_step_id
  )
  INSERT INTO public.company_process_step_requirements
    (company_process_step_id, source_requirement_id, nome, descricao, observacao,
     obrigatorio, ordem, visivel_cliente, nome_publico, descricao_publica)
  SELECT ins.id, r.id, r.nome, r.descricao, r.observacao,
         r.obrigatorio, r.ordem, COALESCE(r.visivel_cliente,false), r.nome_publico, r.descricao_publica
    FROM inserted_steps ins
    JOIN public.process_step_requirements r ON r.process_step_id = ins.process_step_id
   ORDER BY r.ordem;

  RETURN _new_id;
END; $function$;

-- 3) RPC: lista de processos do cliente
CREATE OR REPLACE FUNCTION public.client_list_processes()
RETURNS TABLE (
  id uuid,
  client_id uuid,
  empresa text,
  tipo_nome text,
  status text,
  motivo_espera text,
  prazo_final date,
  data_abertura timestamptz,
  progresso_total int,
  progresso_concluido int,
  aguardando_minha_acao boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  minhas AS (
    SELECT cp.id, cp.client_id, cp.process_type_id, cp.status, cp.motivo_espera,
           cp.prazo_final, cp.created_at
      FROM public.company_processes cp
     WHERE public.user_has_client_access(auth.uid(), cp.client_id)
       AND cp.status <> 'cancelado'
  ),
  progresso AS (
    SELECT s.company_process_id,
           count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false))::int AS total,
           count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false) AND s.status = 'concluida')::int AS done
      FROM public.company_process_steps s
     WHERE s.company_process_id IN (SELECT id FROM minhas)
     GROUP BY s.company_process_id
  ),
  solic AS (
    SELECT dr.company_process_id,
           bool_or(dr.status IN ('pendente','solicitado','reenviar','aguardando_cliente')) AS pend
      FROM public.document_requests dr
     WHERE dr.deleted_at IS NULL
       AND dr.company_process_id IN (SELECT id FROM minhas)
     GROUP BY dr.company_process_id
  )
  SELECT m.id, m.client_id, public.client_label(m.client_id),
         pt.nome, m.status, m.motivo_espera, m.prazo_final, m.created_at,
         COALESCE(p.total,0), COALESCE(p.done,0),
         (m.status = 'aguardando_cliente' OR COALESCE(s.pend,false)) AS aguardando_minha_acao
    FROM minhas m
    LEFT JOIN public.process_types pt ON pt.id = m.process_type_id
    LEFT JOIN progresso p ON p.company_process_id = m.id
    LEFT JOIN solic s ON s.company_process_id = m.id
   ORDER BY m.created_at DESC;
END $$;

-- 4) RPC: detalhe (processo + etapas visíveis + requisitos visíveis + solicitações)
CREATE OR REPLACE FUNCTION public.client_process_detail(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_client uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT client_id INTO v_client FROM public.company_processes WHERE id = _id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='02000'; END IF;
  IF NOT public.user_has_client_access(auth.uid(), v_client) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'processo', to_jsonb(row) - 'observacoes' - 'responsavel_id' - 'created_by' - 'prioridade',
    'empresa', public.client_label(v_client),
    'tipo_nome', (SELECT nome FROM public.process_types WHERE id = row.process_type_id),
    'etapas', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'ordem', s.ordem,
          'nome', COALESCE(NULLIF(s.nome_publico,''), s.nome),
          'descricao', COALESCE(NULLIF(s.descricao_publica,''), NULL),
          'observacao', COALESCE(NULLIF(s.observacao_publica,''), NULL),
          'status', s.status,
          'prazo', s.prazo,
          'concluida_em', s.concluida_em,
          'requisitos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', r.id,
              'nome', COALESCE(NULLIF(r.nome_publico,''), r.nome),
              'descricao', COALESCE(NULLIF(r.descricao_publica,''), NULL),
              'obrigatorio', r.obrigatorio,
              'atendido', (r.document_id IS NOT NULL),
              'solicitacao', (
                SELECT jsonb_build_object('id', dr.id, 'status', dr.status,
                    'prazo', dr.prazo, 'titulo', dr.titulo, 'descricao', dr.descricao)
                  FROM public.document_requests dr
                 WHERE dr.company_process_step_requirement_id = r.id
                   AND dr.deleted_at IS NULL
                 ORDER BY dr.created_at DESC LIMIT 1
              )
            ) ORDER BY r.ordem)
             FROM public.company_process_step_requirements r
            WHERE r.company_process_step_id = s.id
              AND COALESCE(r.visivel_cliente,false)
          ), '[]'::jsonb)
        ) ORDER BY s.ordem)
         FROM public.company_process_steps s
        WHERE s.company_process_id = row.id
          AND COALESCE(s.visivel_cliente,false)
      ), '[]'::jsonb),
    'solicitacoes', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'id', dr.id, 'titulo', dr.titulo, 'status', dr.status,
          'prazo', dr.prazo, 'created_at', dr.created_at,
          'company_process_step_id', dr.company_process_step_id
        ) ORDER BY dr.created_at DESC)
         FROM public.document_requests dr
        WHERE dr.company_process_id = row.id
          AND dr.deleted_at IS NULL
      ), '[]'::jsonb)
  )
  INTO v_result
  FROM (SELECT id, process_type_id, status, motivo_espera, prazo_final, created_at,
               observacoes, responsavel_id, created_by, prioridade
          FROM public.company_processes WHERE id = _id) row;

  RETURN v_result;
END $$;

-- 5) RPC: timeline pública
CREATE OR REPLACE FUNCTION public.client_process_timeline(_id uuid)
RETURNS TABLE (id uuid, tipo text, descricao text, created_at timestamptz, metadata jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_client uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  SELECT client_id INTO v_client FROM public.company_processes WHERE id = _id;
  IF v_client IS NULL OR NOT public.user_has_client_access(auth.uid(), v_client) THEN RETURN; END IF;

  RETURN QUERY
  SELECT te.id, te.tipo, te.descricao, te.created_at, te.metadata
    FROM public.timeline_events te
   WHERE te.client_id = v_client
     AND (te.metadata->>'process_id')::text = _id::text
     AND te.tipo IN (
       'processo_aberto','processo_status','processo_solicitacao_criada',
       'processo_solicitacao_cancelada','processo_requisito_atendido_solicitacao'
     )
   ORDER BY te.created_at DESC
   LIMIT 100;
END $$;

REVOKE ALL ON FUNCTION public.client_list_processes() FROM public, anon;
REVOKE ALL ON FUNCTION public.client_process_detail(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.client_process_timeline(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.client_list_processes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_process_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_process_timeline(uuid) TO authenticated;
