
CREATE OR REPLACE FUNCTION public.get_competence_overview(p_competence text)
RETURNS TABLE (
  client_id uuid,
  razao_social text,
  nome_fantasia text,
  responsavel_nome text,
  is_demo boolean,
  checklist_total int,
  checklist_pendente int,
  checklist_recebido int,
  checklist_concluido int,
  checklist_cancelado int,
  pend_abertas int,
  pend_vencidas int,
  pend_concluidas int,
  pend_aguardando_cliente int,
  sol_aguardando_cliente int,
  sol_em_analise int,
  sol_concluidas int,
  sol_total int,
  doc_total int,
  guias_total int,
  guias_vencidas int,
  guias_proximas int,
  guias_com_comprovante int,
  guias_sem_comprovante int,
  proc_ativos int,
  proc_atrasados int,
  proc_concluidos int,
  proc_aguardando_cliente int
)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    -- RLS on clients aplica user_has_client_access automaticamente
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
      count(*) FILTER (WHERE status = 'aguardando_cliente')                                            AS ag_cli,
      count(*) FILTER (WHERE status IN ('em_analise','em_andamento','pendente'))                       AS em_an,
      count(*) FILTER (WHERE status IN ('concluida','concluido','recebido','aprovada','entregue'))     AS conc,
      count(*)                                                                                          AS total
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
$$;

REVOKE ALL ON FUNCTION public.get_competence_overview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_competence_overview(text) TO authenticated;
