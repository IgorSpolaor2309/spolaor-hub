DO $mig$
DECLARE d text;
BEGIN
  -- ============ 1) get_competence_overview: + contadores canônicos ============
  d := pg_get_functiondef('public.get_competence_overview(text)'::regprocedure);

  d := replace(d,
    'proc_aguardando_cliente integer)',
    'proc_aguardando_cliente integer, sol_cancelado integer, guias_cancelado integer, guias_concluidas integer)');

  d := replace(d,
    'AS total
    FROM public.document_requests',
    'AS total,
      count(*) FILTER (WHERE status = ''cancelado'')                     AS canc
    FROM public.document_requests');

  d := replace(d,
    'AS sem_comp
    FROM public.tax_guides',
    'AS sem_comp,
      count(*) FILTER (WHERE status = ''cancelado'')                                         AS canc,
      count(*) FILTER (WHERE status <> ''cancelado''
                        AND (status IN (''pago'',''baixado'') OR comprovante_path IS NOT NULL)) AS concl
    FROM public.tax_guides');

  d := replace(d,
    'COALESCE(proc.ag_cli,0)::int
FROM visible_clients',
    'COALESCE(proc.ag_cli,0)::int,
  COALESCE(sol.canc,0)::int,
  COALESCE(gu.canc,0)::int,
  COALESCE(gu.concl,0)::int
FROM visible_clients');

  IF d NOT LIKE '%guias_concluidas%' OR d NOT LIKE '%gu.concl%' OR d NOT LIKE '%sol.canc%' THEN
    RAISE EXCEPTION 'patch de get_competence_overview nao aplicou';
  END IF;

  DROP FUNCTION public.get_competence_overview(text);
  EXECUTE d;

  REVOKE ALL ON FUNCTION public.get_competence_overview(text) FROM public;
  GRANT EXECUTE ON FUNCTION public.get_competence_overview(text) TO anon, authenticated, service_role;

  -- ============ 2) get_client_competence_portal: remove formula plana ============
  d := pg_get_functiondef('public.get_client_competence_portal(uuid,text)'::regprocedure);

  d := replace(d,
    '  v_progresso int;
  v_totais record;',
    '  v_pi jsonb;');

  d := regexp_replace(d,
    '  WITH.*?  END;\n',
    '  WITH
    chk AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = ''cancelado'')::int AS c,
             count(*) FILTER (WHERE status = ''concluido'')::int AS d
        FROM public.client_checklist_items
       WHERE client_id = p_client_id AND competencia = p_competence AND deleted_at IS NULL
    ),
    sol AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = ''cancelado'')::int AS c,
             count(*) FILTER (WHERE status = ''concluido'')::int AS d
        FROM public.document_requests
       WHERE client_id = p_client_id AND competencia = p_competence AND deleted_at IS NULL
    ),
    gu AS (
      SELECT count(*)::int AS t,
             count(*) FILTER (WHERE status = ''cancelado'')::int AS c,
             count(*) FILTER (WHERE status <> ''cancelado''
                              AND (status IN (''pago'',''baixado'') OR comprovante_path IS NOT NULL))::int AS d
        FROM public.tax_guides
       WHERE client_id = p_client_id AND competencia = p_competence
    ),
    pnd AS (
      SELECT count(*) FILTER (WHERE status NOT IN (''concluida'',''cancelada''))::int AS a,
             count(*) FILTER (WHERE status = ''concluida''
                              AND data_conclusao >= v_d_start
                              AND data_conclusao <  v_d_end)::int AS d
        FROM public.pending_tasks
       WHERE client_id = p_client_id AND competencia = p_competence
    ),
    prc AS (
      SELECT count(*) FILTER (WHERE status NOT IN (''concluido'',''cancelado''))::int AS a,
             count(*) FILTER (WHERE status = ''concluido''
                              AND data_conclusao >= v_d_start
                              AND data_conclusao <  v_d_end)::int AS d
        FROM public.company_processes
       WHERE client_id = p_client_id
         AND data_abertura <  v_d_end
         AND (data_conclusao IS NULL OR data_conclusao >= v_d_start)
    )
  SELECT jsonb_build_object(
    ''chk_total'', chk.t, ''chk_cancelado'', chk.c, ''chk_concluido'', chk.d,
    ''sol_total'', sol.t, ''sol_cancelado'', sol.c, ''sol_concluidas'', sol.d,
    ''gui_total'', gu.t,  ''gui_cancelado'', gu.c,  ''gui_concluidas'', gu.d,
    ''pend_abertas'', pnd.a, ''pend_concluidas'', pnd.d,
    ''proc_ativos'', prc.a,  ''proc_concluidos'', prc.d
  )
    INTO v_pi
    FROM chk, sol, gu, pnd, prc;
');

  d := replace(d, '    ''progresso'', v_progresso,', '    ''progress_inputs'', v_pi,');

  IF d LIKE '%v_progresso%' OR d LIKE '%v_totais%' OR d NOT LIKE '%progress_inputs%' THEN
    RAISE EXCEPTION 'patch de get_client_competence_portal nao aplicou';
  END IF;

  EXECUTE d;

  REVOKE ALL ON FUNCTION public.get_client_competence_portal(uuid, text) FROM public, anon;
  GRANT EXECUTE ON FUNCTION public.get_client_competence_portal(uuid, text) TO authenticated, service_role;
END $mig$;