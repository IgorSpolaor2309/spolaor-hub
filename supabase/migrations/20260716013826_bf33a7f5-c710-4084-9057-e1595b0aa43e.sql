-- ============================================================
-- Fase 3 Central de Competências: RPCs do Portal do Cliente
-- Somente leitura. Contrato público reduzido, sem campos internos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_client_competence_portal(
  p_client_id uuid,
  p_competence text
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_d_start date;
  v_d_end date;
  v_empresa text;
  v_status text;
  v_updated_at timestamptz;
  v_reopened boolean;
  v_progresso int;
  v_totais record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_competence !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'competence_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_client_access(auth.uid(), p_client_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_d_start := (p_competence || '-01')::date;
  v_d_end := (v_d_start + interval '1 month')::date;
  v_empresa := public.client_label(p_client_id);

  SELECT cc.status, cc.updated_at, (cc.status = 'reopened')
    INTO v_status, v_updated_at, v_reopened
    FROM public.client_competences cc
   WHERE cc.client_id = p_client_id AND cc.competence = p_competence;

  -- Progresso simplificado: soma de módulos aplicáveis.
  WITH
    chk AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = 'concluido')::int AS d
        FROM public.client_checklist_items
       WHERE client_id = p_client_id AND competencia = p_competence AND deleted_at IS NULL
    ),
    sol AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status IN ('concluida','concluido','recebido','aprovada','entregue'))::int AS d
        FROM public.document_requests
       WHERE client_id = p_client_id AND competencia = p_competence AND deleted_at IS NULL
    ),
    gu AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status IN ('pago','baixado','cancelado') OR comprovante_path IS NOT NULL)::int AS d
        FROM public.tax_guides
       WHERE client_id = p_client_id AND competencia = p_competence
    ),
    pnd AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = 'concluida'
                              AND data_conclusao >= v_d_start
                              AND data_conclusao <  v_d_end)::int AS d
        FROM public.pending_tasks
       WHERE client_id = p_client_id AND competencia = p_competence
    ),
    prc AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = 'concluido'
                              AND data_conclusao >= v_d_start
                              AND data_conclusao <  v_d_end)::int AS d
        FROM public.company_processes
       WHERE client_id = p_client_id
         AND data_abertura <  v_d_end
         AND (data_conclusao IS NULL OR data_conclusao >= v_d_start)
    )
  SELECT chk.t + sol.t + gu.t + pnd.t + prc.t AS total,
         chk.d + sol.d + gu.d + pnd.d + prc.d AS done
    INTO v_totais
    FROM chk, sol, gu, pnd, prc;

  v_progresso := CASE
    WHEN COALESCE(v_totais.total,0) = 0 THEN 0
    ELSE round(100.0 * v_totais.done::numeric / v_totais.total)::int
  END;

  v_result := jsonb_build_object(
    'client_id', p_client_id,
    'empresa', v_empresa,
    'competence', p_competence,
    'has_competence', v_status IS NOT NULL,
    'status', v_status,
    'progresso', v_progresso,
    'updated_at', v_updated_at,
    'reopened', COALESCE(v_reopened, false),
    -- 1) O que já foi feito
    'o_que_foi_feito', COALESCE((
      SELECT jsonb_agg(t ORDER BY t->>'data' DESC NULLS LAST)
        FROM (
          SELECT jsonb_build_object(
                   'tipo', 'documento',
                   'titulo', d.nome,
                   'data', d.created_at
                 ) AS t
            FROM public.documents d
           WHERE d.client_id = p_client_id
             AND d.competencia = p_competence
             AND d.deleted_at IS NULL
           ORDER BY d.created_at DESC
           LIMIT 20
        ) x
        UNION ALL SELECT jsonb_build_object(
                   'tipo','solicitacao','titulo',dr.titulo,'data',dr.updated_at)
            FROM public.document_requests dr
           WHERE dr.client_id = p_client_id
             AND dr.competencia = p_competence
             AND dr.deleted_at IS NULL
             AND dr.status IN ('concluida','concluido','recebido','aprovada','entregue')
        UNION ALL SELECT jsonb_build_object(
                   'tipo','guia','titulo',tg.tipo,'data',tg.updated_at)
            FROM public.tax_guides tg
           WHERE tg.client_id = p_client_id
             AND tg.competencia = p_competence
             AND (tg.comprovante_path IS NOT NULL OR tg.status IN ('pago','baixado'))
    ), '[]'::jsonb),
    -- 2) O que depende do cliente
    'precisamos_de_voce', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'prazo') NULLS LAST) FROM (
        SELECT jsonb_build_object(
                 'tipo','solicitacao',
                 'id', dr.id,
                 'titulo', dr.titulo,
                 'prazo', dr.prazo,
                 'situacao', dr.status
               ) AS x
          FROM public.document_requests dr
         WHERE dr.client_id = p_client_id
           AND dr.competencia = p_competence
           AND dr.deleted_at IS NULL
           AND dr.status IN ('pendente','solicitado','reenviar','aguardando_cliente')
        UNION ALL SELECT jsonb_build_object(
                 'tipo','guia_comprovante',
                 'id', tg.id,
                 'titulo', 'Enviar comprovante: ' || tg.tipo,
                 'prazo', tg.vencimento,
                 'situacao', tg.status
               )
          FROM public.tax_guides tg
         WHERE tg.client_id = p_client_id
           AND tg.competencia = p_competence
           AND tg.comprovante_path IS NULL
           AND tg.status NOT IN ('pago','baixado','cancelado')
      ) t
    ), '[]'::jsonb),
    -- 3) Solicitações agrupadas
    'solicitacoes', jsonb_build_object(
      'aguardando_envio', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'titulo',titulo,'prazo',prazo) ORDER BY prazo NULLS LAST)
          FROM public.document_requests
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL
           AND status IN ('pendente','solicitado','aguardando_cliente')
      ), '[]'::jsonb),
      'reenviar', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'titulo',titulo,'prazo',prazo))
          FROM public.document_requests
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL AND status = 'reenviar'
      ), '[]'::jsonb),
      'em_analise', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'titulo',titulo))
          FROM public.document_requests
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL AND status IN ('em_analise','em_andamento')
      ), '[]'::jsonb),
      'concluidas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'titulo',titulo) ORDER BY updated_at DESC)
          FROM public.document_requests
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL
           AND status IN ('concluida','concluido','recebido','aprovada','entregue')
      ), '[]'::jsonb)
    ),
    -- 4) Guias
    'guias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id,
               'tipo', tipo,
               'competencia', competencia,
               'vencimento', vencimento,
               'status', status,
               'tem_comprovante', (comprovante_path IS NOT NULL),
               'vencida', (vencimento IS NOT NULL
                           AND vencimento < current_date
                           AND status NOT IN ('pago','baixado','cancelado'))
             ) ORDER BY vencimento NULLS LAST)
        FROM public.tax_guides
       WHERE client_id = p_client_id AND competencia = p_competence
    ), '[]'::jsonb),
    -- 5) Processos públicos (com progresso público)
    'processos', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
                 'id', cp.id,
                 'tipo', (SELECT nome FROM public.process_types WHERE id = cp.process_type_id),
                 'status', cp.status,
                 'progresso_total', COALESCE((
                    SELECT count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false))
                      FROM public.company_process_steps s WHERE s.company_process_id = cp.id), 0),
                 'progresso_concluido', COALESCE((
                    SELECT count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false) AND s.status='concluida')
                      FROM public.company_process_steps s WHERE s.company_process_id = cp.id), 0),
                 'prazo', cp.prazo_final,
                 'updated_at', cp.updated_at
               ) AS x
          FROM public.company_processes cp
         WHERE cp.client_id = p_client_id
           AND cp.status <> 'cancelado'
           AND cp.data_abertura <  v_d_end
           AND (cp.data_conclusao IS NULL OR cp.data_conclusao >= v_d_start)
         ORDER BY cp.updated_at DESC
         LIMIT 30
      ) q
    ), '[]'::jsonb),
    -- 6) Documentos permitidos
    'documentos', jsonb_build_object(
      'escritorio', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'tipo',tipo,'data',created_at)
                          ORDER BY created_at DESC)
          FROM public.documents
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL
           AND (uploaded_by IS NULL OR uploaded_by <> auth.uid())
         LIMIT 50
      ), '[]'::jsonb),
      'cliente', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'nome',nome,'tipo',tipo,'data',created_at)
                          ORDER BY created_at DESC)
          FROM public.documents
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL
           AND uploaded_by = auth.uid()
         LIMIT 50
      ), '[]'::jsonb)
    ),
    -- 7) Timeline pública conservadora
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', te.id,
               'tipo', te.tipo,
               'descricao', te.descricao,
               'created_at', te.created_at
             ) ORDER BY te.created_at DESC)
        FROM public.timeline_events te
       WHERE te.client_id = p_client_id
         AND te.created_at >= v_d_start
         AND te.created_at <  v_d_end
         AND te.tipo IN (
           'documento_enviado','documento_recebido',
           'solicitacao_criada','solicitacao_concluida',
           'guia_criada','guia_disponibilizada','guia_paga',
           'processo_aberto','processo_status','processo_solicitacao_criada',
           'processo_requisito_atendido_solicitacao',
           'competencia_iniciada','competencia_enviada_revisao','competencia_concluida','competencia_reaberta'
         )
       LIMIT 100
    ), '[]'::jsonb)
  );

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_client_competence_portal(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_client_competence_portal(uuid, text) TO authenticated;

-- ============================================================
-- Histórico de competências persistidas para o portal
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_client_competence_history(
  p_client_id uuid,
  p_limit int DEFAULT 12
) RETURNS TABLE (
  competence text,
  status text,
  updated_at timestamptz,
  reopened boolean
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.user_has_client_access(auth.uid(), p_client_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT cc.competence,
         cc.status,
         cc.updated_at,
         (cc.status = 'reopened') AS reopened
    FROM public.client_competences cc
   WHERE cc.client_id = p_client_id
   ORDER BY cc.competence DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 60));
END $$;

REVOKE ALL ON FUNCTION public.get_client_competence_history(uuid, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_client_competence_history(uuid, int) TO authenticated;
