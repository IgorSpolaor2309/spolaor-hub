-- Adiciona critério de desempate estável (id) na ordenação das duas RPCs paginadas
-- do módulo Processos. Sem isso, registros com mesmo valor no campo principal
-- podem alternar de página entre requisições, causando duplicação/omissão.

CREATE OR REPLACE FUNCTION public.list_company_processes_paginated(
  _search text DEFAULT NULL,
  _client_id uuid DEFAULT NULL,
  _process_type_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _prioridade text DEFAULT NULL,
  _responsavel_id uuid DEFAULT NULL,
  _prazo text DEFAULT NULL,
  _tab text DEFAULT 'todos',
  _sort_by text DEFAULT 'prazo',
  _include_demo boolean DEFAULT true,
  _only_demo boolean DEFAULT false,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_offset integer;
  v_limit integer;
  v_rows jsonb;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(_page_size, 30), 100));
  v_offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * v_limit;

  WITH base AS (
    SELECT
      cp.id, cp.client_id, cp.process_type_id, cp.responsavel_id,
      cp.data_abertura, cp.prazo_final, cp.prioridade, cp.status,
      cp.observacoes, cp.progresso, cp.total_etapas, cp.etapas_concluidas,
      cp.motivo_espera, cp.is_demo, cp.created_at,
      c.razao_social, c.nome_fantasia, c.documento,
      pt.nome AS type_nome, pt.cor AS type_cor, pt.categoria AS type_categoria,
      p.full_name AS responsavel_full_name
    FROM public.company_processes cp
    LEFT JOIN public.clients c ON c.id = cp.client_id
    LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
    LEFT JOIN public.profiles p ON p.id = cp.responsavel_id
    WHERE
      (_include_demo OR cp.is_demo = false)
      AND (NOT _only_demo OR cp.is_demo = true)
      AND (_client_id IS NULL OR cp.client_id = _client_id)
      AND (_process_type_id IS NULL OR cp.process_type_id = _process_type_id)
      AND (_status IS NULL OR cp.status = _status)
      AND (_prioridade IS NULL OR cp.prioridade = _prioridade)
      AND (_responsavel_id IS NULL OR cp.responsavel_id = _responsavel_id)
      AND (_tab <> 'meus' OR (v_uid IS NOT NULL AND cp.responsavel_id = v_uid))
      AND (_tab <> 'aguardando' OR cp.status IN ('aguardando_cliente','aguardando_orgao'))
      AND (_tab <> 'atrasados' OR (
            cp.status NOT IN ('concluido','cancelado')
            AND cp.prazo_final IS NOT NULL
            AND cp.prazo_final < v_today))
      AND (_tab <> 'concluidos' OR cp.status = 'concluido')
      AND (_prazo IS NULL OR _prazo = 'all' OR (
            cp.status NOT IN ('concluido','cancelado') AND (
              (_prazo = 'vencido'   AND cp.prazo_final IS NOT NULL AND cp.prazo_final < v_today) OR
              (_prazo = 'hoje'      AND cp.prazo_final = v_today) OR
              (_prazo = 'em_breve'  AND cp.prazo_final BETWEEN (v_today + 1) AND (v_today + 7)) OR
              (_prazo = 'sem_prazo' AND cp.prazo_final IS NULL))))
      AND (_search IS NULL OR _search = '' OR (
            c.razao_social  ILIKE '%'||_search||'%' OR
            c.nome_fantasia ILIKE '%'||_search||'%' OR
            c.documento     ILIKE '%'||_search||'%' OR
            pt.nome         ILIKE '%'||_search||'%' OR
            cp.observacoes  ILIKE '%'||_search||'%'))
  ),
  counted AS (SELECT count(*)::bigint AS total FROM base),
  paged AS (
    SELECT * FROM base
    ORDER BY
      CASE WHEN _sort_by = 'empresa'     THEN razao_social END ASC NULLS LAST,
      CASE WHEN _sort_by = 'responsavel' THEN responsavel_full_name END ASC NULLS LAST,
      CASE WHEN _sort_by = 'status'      THEN status END ASC NULLS LAST,
      CASE WHEN _sort_by = 'progresso'   THEN progresso END DESC NULLS LAST,
      CASE WHEN _sort_by = 'abertura'    THEN data_abertura END DESC NULLS LAST,
      CASE WHEN _sort_by = 'prazo' OR _sort_by IS NULL OR _sort_by NOT IN ('empresa','responsavel','status','progresso','abertura')
           THEN prazo_final END ASC NULLS LAST,
      created_at DESC,
      id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'page', COALESCE(_page, 1),
    'page_size', v_limit,
    'rows', COALESCE(jsonb_agg(jsonb_build_object(
      'id', paged.id,
      'client_id', paged.client_id,
      'process_type_id', paged.process_type_id,
      'responsavel_id', paged.responsavel_id,
      'data_abertura', paged.data_abertura,
      'prazo_final', paged.prazo_final,
      'prioridade', paged.prioridade,
      'status', paged.status,
      'observacoes', paged.observacoes,
      'progresso', paged.progresso,
      'total_etapas', paged.total_etapas,
      'etapas_concluidas', paged.etapas_concluidas,
      'motivo_espera', paged.motivo_espera,
      'is_demo', paged.is_demo,
      'clients', jsonb_build_object(
        'razao_social', paged.razao_social,
        'nome_fantasia', paged.nome_fantasia,
        'documento', paged.documento
      ),
      'process_types', jsonb_build_object(
        'nome', paged.type_nome,
        'cor', paged.type_cor,
        'categoria', paged.type_categoria
      ),
      'responsavel', CASE
        WHEN paged.responsavel_id IS NULL THEN NULL
        ELSE jsonb_build_object('full_name', paged.responsavel_full_name)
      END
    )), '[]'::jsonb)
  ) INTO v_rows FROM paged;

  RETURN v_rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_process_steps_paginated(
  _search text DEFAULT NULL,
  _status_group text DEFAULT 'open',
  _prazo text DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_offset integer;
  v_limit integer;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total',0,'page',1,'page_size',COALESCE(_page_size,30));
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(_page_size, 30), 100));
  v_offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * v_limit;

  WITH base AS (
    SELECT
      s.id, s.nome, s.status, s.prazo, s.concluida_dentro_prazo, s.data_conclusao,
      s.company_process_id, s.ordem,
      cp.id AS proc_id, cp.status AS proc_status, cp.prioridade,
      cp.client_id, cp.process_type_id,
      c.razao_social, c.nome_fantasia, c.documento,
      pt.nome AS type_nome, pt.cor AS type_cor
    FROM public.company_process_steps s
    JOIN public.company_processes cp ON cp.id = s.company_process_id
    LEFT JOIN public.clients c ON c.id = cp.client_id
    LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
    WHERE s.responsavel_id = v_uid
      AND (_status_group = 'all'
           OR (_status_group = 'open' AND s.status NOT IN ('concluida','cancelada'))
           OR (_status_group = 'done' AND s.status = 'concluida'))
      AND (_prazo IS NULL OR _prazo = 'all' OR (
            (_prazo = 'vencido'   AND s.status NOT IN ('concluida','cancelada') AND s.prazo IS NOT NULL AND s.prazo < v_today) OR
            (_prazo = 'hoje'      AND s.status NOT IN ('concluida','cancelada') AND s.prazo = v_today) OR
            (_prazo = 'em_breve'  AND s.status NOT IN ('concluida','cancelada') AND s.prazo BETWEEN (v_today+1) AND (v_today+7)) OR
            (_prazo = 'sem_prazo' AND s.status NOT IN ('concluida','cancelada') AND s.prazo IS NULL)))
      AND (_search IS NULL OR _search = '' OR (
            c.razao_social  ILIKE '%'||_search||'%' OR
            c.nome_fantasia ILIKE '%'||_search||'%' OR
            pt.nome         ILIKE '%'||_search||'%' OR
            s.nome          ILIKE '%'||_search||'%'))
  ),
  counted AS (SELECT count(*)::bigint AS total FROM base),
  paged AS (
    SELECT * FROM base
    ORDER BY prazo ASC NULLS LAST, ordem ASC, id DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT total FROM counted),
    'page', COALESCE(_page,1),
    'page_size', v_limit,
    'rows', COALESCE(jsonb_agg(jsonb_build_object(
      'id', paged.id,
      'nome', paged.nome,
      'status', paged.status,
      'prazo', paged.prazo,
      'concluida_dentro_prazo', paged.concluida_dentro_prazo,
      'data_conclusao', paged.data_conclusao,
      'company_process_id', paged.company_process_id,
      'ordem', paged.ordem,
      'company_processes', jsonb_build_object(
        'id', paged.proc_id,
        'status', paged.proc_status,
        'prioridade', paged.prioridade,
        'client_id', paged.client_id,
        'process_type_id', paged.process_type_id,
        'clients', jsonb_build_object(
          'razao_social', paged.razao_social,
          'nome_fantasia', paged.nome_fantasia,
          'documento', paged.documento
        ),
        'process_types', jsonb_build_object(
          'nome', paged.type_nome,
          'cor', paged.type_cor
        )
      )
    )), '[]'::jsonb)
  ) INTO v_rows FROM paged;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_company_processes_paginated(text,uuid,uuid,text,text,uuid,text,text,text,boolean,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_process_steps_paginated(text,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_processes_paginated(text,uuid,uuid,text,text,uuid,text,text,text,boolean,boolean,integer,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_process_steps_paginated(text,text,text,integer,integer) TO authenticated, service_role;