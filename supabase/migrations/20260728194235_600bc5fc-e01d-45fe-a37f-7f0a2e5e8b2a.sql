-- =====================================================================
-- FASE 2 — Central de Documentos + Solicitações
-- Unificação de status de public.document_requests
-- =====================================================================

BEGIN;

-- 1) MIGRAÇÃO DOS DADOS ------------------------------------------------
UPDATE public.document_requests
SET status = CASE status
  WHEN 'pendente'           THEN 'aguardando'
  WHEN 'solicitado'         THEN 'aguardando'
  WHEN 'aguardando_cliente' THEN 'aguardando'
  WHEN 'em_andamento'       THEN 'recebido'
  WHEN 'recusado'           THEN 'reenviar'
  WHEN 'concluida'          THEN 'concluido'
  ELSE status
END
WHERE status IN ('pendente','solicitado','aguardando_cliente','em_andamento','recusado','concluida');

-- 2) CHECK CONSTRAINT --------------------------------------------------
ALTER TABLE public.document_requests
  DROP CONSTRAINT IF EXISTS document_requests_status_chk;

ALTER TABLE public.document_requests
  ADD CONSTRAINT document_requests_status_chk
  CHECK (status IN ('aguardando','recebido','reenviar','concluido','cancelado'));

-- 3) DEFAULT FINAL -----------------------------------------------------
ALTER TABLE public.document_requests
  ALTER COLUMN status SET DEFAULT 'aguardando';

-- 4) FUNÇÕES DE BANCO --------------------------------------------------

-- 4.1) client_list_processes: pendência de solicitação usa 'aguardando'/'reenviar'
CREATE OR REPLACE FUNCTION public.client_list_processes()
 RETURNS TABLE(id uuid, client_id uuid, empresa text, tipo_nome text, status text, motivo_espera text, prazo_final date, data_abertura timestamp with time zone, progresso_total integer, progresso_concluido integer, aguardando_minha_acao boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  minhas AS (
    SELECT cp.id            AS proc_id,
           cp.client_id     AS proc_client_id,
           cp.process_type_id,
           cp.status        AS proc_status,
           cp.motivo_espera AS proc_motivo_espera,
           cp.prazo_final   AS proc_prazo_final,
           cp.created_at    AS proc_created_at
      FROM public.company_processes cp
     WHERE public.user_has_client_access(auth.uid(), cp.client_id)
       AND cp.status <> 'cancelado'
  ),
  progresso AS (
    SELECT s.company_process_id,
           count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false))::int AS total,
           count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false) AND s.status = 'concluida')::int AS done
      FROM public.company_process_steps s
     WHERE s.company_process_id IN (SELECT m.proc_id FROM minhas m)
     GROUP BY s.company_process_id
  ),
  solic AS (
    SELECT dr.company_process_id,
           bool_or(dr.status IN ('aguardando','reenviar')) AS pend
      FROM public.document_requests dr
     WHERE dr.deleted_at IS NULL
       AND dr.company_process_id IN (SELECT m.proc_id FROM minhas m)
     GROUP BY dr.company_process_id
  )
  SELECT m.proc_id,
         m.proc_client_id,
         public.client_label(m.proc_client_id),
         pt.nome,
         m.proc_status,
         m.proc_motivo_espera,
         m.proc_prazo_final,
         m.proc_created_at,
         COALESCE(p.total,0),
         COALESCE(p.done,0),
         (m.proc_status = 'aguardando_cliente' OR COALESCE(s.pend,false)) AS aguardando_minha_acao
    FROM minhas m
    LEFT JOIN public.process_types pt ON pt.id = m.process_type_id
    LEFT JOIN progresso p ON p.company_process_id = m.proc_id
    LEFT JOIN solic s     ON s.company_process_id = m.proc_id
   ORDER BY m.proc_created_at DESC;
END $function$;

-- 4.2) competence_evaluate: bloqueio "aguardando cliente" agora usa status 'aguardando'
CREATE OR REPLACE FUNCTION public.competence_evaluate(p_client_id uuid, p_competence text, p_phase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Solicitações que dependem do cliente: aguardando ou reenviar
  SELECT count(*) INTO v_sol_ag_cli
  FROM public.document_requests
  WHERE client_id = p_client_id AND competencia = p_competence
    AND deleted_at IS NULL AND status IN ('aguardando','reenviar');

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
END $function$;

-- 4.3) get_client_competence_portal: portal do cliente
CREATE OR REPLACE FUNCTION public.get_client_competence_portal(p_client_id uuid, p_competence text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  WITH
    chk AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = 'concluido')::int AS d
        FROM public.client_checklist_items
       WHERE client_id = p_client_id AND competencia = p_competence AND deleted_at IS NULL
    ),
    sol AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = 'concluido')::int AS d
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
             AND dr.status IN ('recebido','concluido')
        UNION ALL SELECT jsonb_build_object(
                   'tipo','guia','titulo',tg.tipo,'data',tg.updated_at)
            FROM public.tax_guides tg
           WHERE tg.client_id = p_client_id
             AND tg.competencia = p_competence
             AND (tg.comprovante_path IS NOT NULL OR tg.status IN ('pago','baixado'))
    ), '[]'::jsonb),
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
           AND dr.status IN ('aguardando','reenviar')
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
    'solicitacoes', jsonb_build_object(
      'aguardando_envio', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'titulo',titulo,'prazo',prazo) ORDER BY prazo NULLS LAST)
          FROM public.document_requests
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL
           AND status = 'aguardando'
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
           AND deleted_at IS NULL AND status = 'recebido'
      ), '[]'::jsonb),
      'concluidas', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',id,'titulo',titulo) ORDER BY updated_at DESC)
          FROM public.document_requests
         WHERE client_id = p_client_id AND competencia = p_competence
           AND deleted_at IS NULL
           AND status = 'concluido'
      ), '[]'::jsonb)
    ),
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
END $function$;

-- 4.4) get_competence_overview: CTE `sol` remapeado para novos status
CREATE OR REPLACE FUNCTION public.get_competence_overview(p_competence text)
 RETURNS TABLE(client_id uuid, razao_social text, nome_fantasia text, responsavel_nome text, is_demo boolean, checklist_total integer, checklist_pendente integer, checklist_recebido integer, checklist_concluido integer, checklist_cancelado integer, pend_abertas integer, pend_vencidas integer, pend_concluidas integer, pend_aguardando_cliente integer, sol_aguardando_cliente integer, sol_em_analise integer, sol_concluidas integer, sol_total integer, doc_total integer, guias_total integer, guias_vencidas integer, guias_proximas integer, guias_com_comprovante integer, guias_sem_comprovante integer, proc_ativos integer, proc_atrasados integer, proc_concluidos integer, proc_aguardando_cliente integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH
  bounds AS (
    SELECT (p_competence || '-01')::date AS d_start,
           ((p_competence || '-01')::date + interval '1 month')::date AS d_end
  ),
  visible_clients AS (
    SELECT c.id, c.razao_social, c.nome_fantasia, c.is_demo, c.owner_profile_id
    FROM public.clients c
    WHERE c.deleted_at IS NULL
      AND COALESCE(c.status, 'active') <> 'inactive'
  ),
  chk AS (
    SELECT client_id,
      count(*)                                              AS total,
      count(*) FILTER (WHERE status = 'pendente')           AS s_pend,
      count(*) FILTER (WHERE status = 'recebido')           AS s_rec,
      count(*) FILTER (WHERE status = 'concluido')          AS s_conc,
      count(*) FILTER (WHERE status = 'cancelado')          AS s_canc
    FROM public.client_checklist_items
    WHERE deleted_at IS NULL AND competencia = p_competence
    GROUP BY client_id
  ),
  pend AS (
    SELECT pt.client_id,
      count(*) FILTER (WHERE pt.status NOT IN ('concluida','cancelada')) AS abertas,
      count(*) FILTER (WHERE pt.status NOT IN ('concluida','cancelada')
                        AND pt.prazo IS NOT NULL AND pt.prazo < current_date) AS vencidas,
      count(*) FILTER (WHERE pt.status = 'concluida'
                        AND pt.data_conclusao >= (SELECT d_start FROM bounds)
                        AND pt.data_conclusao <  (SELECT d_end   FROM bounds)) AS concluidas,
      count(*) FILTER (WHERE pt.status = 'aguardando_cliente') AS ag_cliente
    FROM public.pending_tasks pt
    WHERE pt.competencia = p_competence
    GROUP BY pt.client_id
  ),
  sol AS (
    SELECT client_id,
      count(*) FILTER (WHERE status IN ('aguardando','reenviar'))       AS ag_cli,
      count(*) FILTER (WHERE status = 'recebido')                       AS em_an,
      count(*) FILTER (WHERE status = 'concluido')                      AS conc,
      count(*)                                                          AS total
    FROM public.document_requests
    WHERE deleted_at IS NULL AND competencia = p_competence
    GROUP BY client_id
  ),
  docs AS (
    SELECT client_id, count(*) AS total
    FROM public.documents
    WHERE deleted_at IS NULL AND competencia = p_competence
    GROUP BY client_id
  ),
  gu AS (
    SELECT client_id,
      count(*)                                                                               AS total,
      count(*) FILTER (WHERE vencimento IS NOT NULL AND vencimento < current_date
                        AND status NOT IN ('pago','baixado','cancelado'))                   AS venc,
      count(*) FILTER (WHERE vencimento IS NOT NULL
                        AND vencimento >= current_date
                        AND vencimento <= current_date + 7
                        AND status NOT IN ('pago','baixado','cancelado'))                    AS prox,
      count(*) FILTER (WHERE comprovante_path IS NOT NULL)                                   AS com_comp,
      count(*) FILTER (WHERE comprovante_path IS NULL)                                       AS sem_comp
    FROM public.tax_guides
    WHERE competencia = p_competence
    GROUP BY client_id
  ),
  proc AS (
    SELECT cp.client_id,
      count(*) FILTER (WHERE cp.status NOT IN ('concluido','cancelado')
                        AND cp.data_abertura <  (SELECT d_end   FROM bounds)
                        AND (cp.data_conclusao IS NULL
                             OR cp.data_conclusao >= (SELECT d_start FROM bounds))) AS ativos,
      count(*) FILTER (WHERE cp.status NOT IN ('concluido','cancelado')
                        AND cp.prazo_final IS NOT NULL
                        AND cp.prazo_final < current_date)                          AS atrasados,
      count(*) FILTER (WHERE cp.status = 'concluido'
                        AND cp.data_conclusao >= (SELECT d_start FROM bounds)
                        AND cp.data_conclusao <  (SELECT d_end   FROM bounds))     AS concluidos,
      count(*) FILTER (WHERE cp.status = 'aguardando_cliente'
                        AND cp.data_abertura <  (SELECT d_end   FROM bounds)
                        AND (cp.data_conclusao IS NULL
                             OR cp.data_conclusao >= (SELECT d_start FROM bounds))) AS ag_cli
    FROM public.company_processes cp
    GROUP BY cp.client_id
  )
SELECT
  vc.id,
  vc.razao_social,
  vc.nome_fantasia,
  p.full_name,
  vc.is_demo,
  COALESCE(chk.total,0)::int,
  COALESCE(chk.s_pend,0)::int,
  COALESCE(chk.s_rec,0)::int,
  COALESCE(chk.s_conc,0)::int,
  COALESCE(chk.s_canc,0)::int,
  COALESCE(pend.abertas,0)::int,
  COALESCE(pend.vencidas,0)::int,
  COALESCE(pend.concluidas,0)::int,
  COALESCE(pend.ag_cliente,0)::int,
  COALESCE(sol.ag_cli,0)::int,
  COALESCE(sol.em_an,0)::int,
  COALESCE(sol.conc,0)::int,
  COALESCE(sol.total,0)::int,
  COALESCE(docs.total,0)::int,
  COALESCE(gu.total,0)::int,
  COALESCE(gu.venc,0)::int,
  COALESCE(gu.prox,0)::int,
  COALESCE(gu.com_comp,0)::int,
  COALESCE(gu.sem_comp,0)::int,
  COALESCE(proc.ativos,0)::int,
  COALESCE(proc.atrasados,0)::int,
  COALESCE(proc.concluidos,0)::int,
  COALESCE(proc.ag_cli,0)::int
FROM visible_clients vc
LEFT JOIN public.profiles p ON p.id = vc.owner_profile_id
LEFT JOIN chk  ON chk.client_id  = vc.id
LEFT JOIN pend ON pend.client_id = vc.id
LEFT JOIN sol  ON sol.client_id  = vc.id
LEFT JOIN docs ON docs.client_id = vc.id
LEFT JOIN gu   ON gu.client_id   = vc.id
LEFT JOIN proc ON proc.client_id = vc.id
ORDER BY vc.razao_social;
$function$;

-- 4.5) on_document_request_change: notificações consistentes com o novo conjunto
CREATE OR REPLACE FUNCTION public.on_document_request_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_link text := '/solicitacoes';
  v_empresa text;
  v_msg text;
BEGIN
  v_empresa := public.client_label(NEW.client_id);
  v_msg := COALESCE(NULLIF(NEW.titulo,''), NULLIF(NEW.tipo_solicitacao,''), NULLIF(NEW.categoria,''), 'Solicitação')
    || COALESCE(' · ' || NULLIF(NEW.departamento,''), '')
    || COALESCE(' · urgência ' || NULLIF(NEW.urgencia,''), '')
    || COALESCE(' · prazo ' || to_char(NEW.prazo,'DD/MM/YYYY'), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW.criado_por_role = 'client' THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Nova solicitação do cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSE
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento solicitado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'reenviar' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento precisa ser reenviado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'recebido' THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento enviado pelo cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'aguardando' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Aguardando sua resposta — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'concluido' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Solicitação concluída — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'cancelado' THEN
      IF NEW.criado_por_role = 'client' THEN
        FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
          PERFORM public.notify_user(v_user, 'solicitacao', 'Cliente cancelou a solicitação — ' || v_empresa, v_msg, v_link);
        END LOOP;
      ELSE
        FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
          PERFORM public.notify_user(v_user, 'solicitacao', 'Solicitação cancelada — ' || v_empresa, v_msg, v_link);
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.attachment_final_path IS NOT NULL
     AND COALESCE(OLD.attachment_final_path,'') = '' THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'solicitacao', 'Arquivo disponível — ' || v_empresa,
        COALESCE(NEW.attachment_final_name, 'Arquivo entregue pela contabilidade.'), v_link);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;