-- FASE 3 — Central de Documentos + Solicitações — camada de dados

-- 1. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_documents_client_alive
  ON public.documents(client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_client_validade_alive
  ON public.documents(client_id, data_validade)
  WHERE deleted_at IS NULL AND data_validade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_data_validade_alive
  ON public.documents(data_validade)
  WHERE deleted_at IS NULL AND data_validade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_client_competencia_alive
  ON public.documents(client_id, competencia)
  WHERE deleted_at IS NULL AND competencia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dr_client_status_alive
  ON public.document_requests(client_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dr_prazo_alive
  ON public.document_requests(prazo)
  WHERE deleted_at IS NULL AND prazo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dr_competencia_alive
  ON public.document_requests(competencia)
  WHERE deleted_at IS NULL AND competencia IS NOT NULL;

-- 2. LABELS EXTERNAS
CREATE OR REPLACE FUNCTION public._doc_workspace_status_label_staff(
  _kind text, _status text, _data_validade date
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN _kind = 'document' THEN
      CASE
        WHEN _data_validade IS NULL THEN 'Arquivado'
        WHEN _data_validade < CURRENT_DATE THEN 'Vencido'
        WHEN _data_validade <= (CURRENT_DATE + 30) THEN 'Vencendo'
        ELSE 'Arquivado'
      END
    ELSE
      CASE _status
        WHEN 'aguardando' THEN 'Aguardando'
        WHEN 'recebido'   THEN 'Recebido'
        WHEN 'reenviar'   THEN 'Reenviar'
        WHEN 'concluido'  THEN 'Concluído'
        WHEN 'cancelado'  THEN 'Cancelado'
        ELSE _status
      END
  END
$fn$;

CREATE OR REPLACE FUNCTION public._doc_workspace_status_label_client(
  _status text, _action_owner text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE _status
    WHEN 'aguardando' THEN
      CASE _action_owner WHEN 'client' THEN 'Aguardando você' ELSE 'Aguardando a contabilidade' END
    WHEN 'recebido'  THEN 'Em análise pela contabilidade'
    WHEN 'reenviar'  THEN 'Precisa reenviar'
    WHEN 'concluido' THEN 'Concluído'
    WHEN 'cancelado' THEN 'Cancelado'
    ELSE _status
  END
$fn$;

-- 3. RPC STAFF
CREATE OR REPLACE FUNCTION public.list_document_workspace_paginated(
  _tab text            DEFAULT 'todos',
  _page int            DEFAULT 1,
  _page_size int       DEFAULT 30,
  _search text         DEFAULT NULL,
  _client_id uuid      DEFAULT NULL,
  _competencia text    DEFAULT NULL,
  _categoria text      DEFAULT NULL,
  _tipo text           DEFAULT NULL,
  _departamento text   DEFAULT NULL,
  _status text         DEFAULT NULL,
  _action_owner text   DEFAULT NULL,
  _responsavel_id uuid DEFAULT NULL,
  _origem text         DEFAULT NULL,
  _prazo_from date     DEFAULT NULL,
  _prazo_to date       DEFAULT NULL,
  _validade_from date  DEFAULT NULL,
  _validade_to date    DEFAULT NULL,
  _tem_documento boolean DEFAULT NULL,
  _tem_vinculo boolean DEFAULT NULL,
  _somente_meus boolean DEFAULT false,
  _include_demo boolean DEFAULT true,
  _demo_batch_id uuid  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_page int := GREATEST(COALESCE(_page, 1), 1);
  v_page_size int := LEAST(GREATEST(COALESCE(_page_size, 30), 1), 100);
  v_offset int;
  v_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_pattern text := CASE WHEN v_search IS NULL THEN NULL ELSE '%' || v_search || '%' END;
  v_tabs constant text[] := ARRAY[
    'aguardando_cliente','recebidos','reenviar','concluidos',
    'vinculados','vencendo','vencidos','todos'
  ];
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role)
          OR public.has_role(v_uid, 'collaborator'::app_role)) THEN
    RAISE EXCEPTION 'staff only' USING ERRCODE = '42501';
  END IF;
  IF NOT (_tab = ANY (v_tabs)) THEN
    RAISE EXCEPTION 'invalid tab %', _tab USING ERRCODE = '22023';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH
  req AS (
    SELECT
      dr.id                          AS item_id,
      'document_request'::text       AS item_kind,
      dr.client_id,
      c.razao_social                 AS empresa_nome,
      COALESCE(c.cnpj, c.documento)  AS empresa_documento,
      dr.titulo                      AS titulo,
      dr.descricao                   AS descricao_resumida,
      dr.categoria,
      dr.tipo_solicitacao            AS tipo,
      dr.departamento,
      dr.competencia,
      dr.status                      AS status,
      public._doc_workspace_status_label_staff('document_request', dr.status, NULL) AS status_label,
      CASE
        WHEN dr.status IN ('concluido','cancelado') THEN 'none'
        WHEN dr.status = 'recebido' THEN 'staff'
        WHEN dr.status = 'reenviar' THEN 'client'
        WHEN dr.status = 'aguardando' THEN
          CASE
            WHEN dr.criado_por_role = 'client' THEN 'staff'
            WHEN dr.criado_por_role = 'staff'  THEN 'client'
            ELSE CASE
              WHEN dr.criado_por IS NOT NULL AND public.has_role(dr.criado_por, 'client'::app_role) THEN 'staff'
              ELSE 'client'
            END
          END
        ELSE 'none'
      END                             AS action_owner,
      dr.prazo,
      d.data_validade                 AS data_validade,
      dr.urgencia                     AS urgency,
      dr.responsavel_profile_id       AS responsavel_id,
      pr.full_name                    AS responsavel_nome,
      d.id                            AS document_id,
      d.nome                          AS document_name,
      d.storage_path                  AS document_storage_path,
      (d.id IS NOT NULL)              AS has_document,
      (dr.company_process_id IS NOT NULL
        OR dr.company_process_step_id IS NOT NULL
        OR dr.company_process_step_requirement_id IS NOT NULL
      )                               AS has_process_link,
      1                               AS links_count,
      dr.company_process_id,
      dr.company_process_step_id,
      dr.company_process_step_requirement_id,
      pt.nome                         AS process_type_name,
      cps.nome                        AS process_step_name,
      (d.data_validade IS NOT NULL
        AND d.data_validade >= CURRENT_DATE
        AND d.data_validade <= (CURRENT_DATE + 30))  AS is_expiring,
      (d.data_validade IS NOT NULL AND d.data_validade < CURRENT_DATE) AS is_expired,
      dr.is_demo,
      dr.demo_batch_id,
      dr.criado_por_role,
      dr.criado_por,
      dr.created_at,
      dr.updated_at
    FROM public.document_requests dr
    JOIN public.clients c ON c.id = dr.client_id
    LEFT JOIN public.documents d ON d.id = dr.document_id AND d.deleted_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = dr.responsavel_profile_id
    LEFT JOIN public.company_processes cp ON cp.id = dr.company_process_id
    LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
    LEFT JOIN public.company_process_steps cps ON cps.id = dr.company_process_step_id
    WHERE dr.deleted_at IS NULL
  ),
  doc_links AS (
    SELECT d.id AS document_id,
           MAX(cpd.company_process_id)      AS main_process_id,
           MAX(cpd.company_process_step_id) AS main_step_id,
           COUNT(*)::int                    AS links_count
      FROM public.documents d
      JOIN public.company_process_documents cpd ON cpd.document_id = d.id
     WHERE d.deleted_at IS NULL
     GROUP BY d.id
  ),
  doc AS (
    SELECT
      d.id                          AS item_id,
      'document'::text              AS item_kind,
      d.client_id,
      c.razao_social                AS empresa_nome,
      COALESCE(c.cnpj, c.documento) AS empresa_documento,
      d.nome                        AS titulo,
      NULL::text                    AS descricao_resumida,
      d.categoria_validade          AS categoria,
      d.tipo                        AS tipo,
      NULL::text                    AS departamento,
      d.competencia,
      NULL::text                    AS status,
      public._doc_workspace_status_label_staff('document', NULL, d.data_validade) AS status_label,
      'none'::text                  AS action_owner,
      NULL::date                    AS prazo,
      d.data_validade,
      NULL::text                    AS urgency,
      NULL::uuid                    AS responsavel_id,
      NULL::text                    AS responsavel_nome,
      d.id                          AS document_id,
      d.nome                        AS document_name,
      d.storage_path                AS document_storage_path,
      true                          AS has_document,
      (dl.document_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.company_process_step_requirements r
         WHERE r.document_id = d.id
      ))                            AS has_process_link,
      COALESCE(dl.links_count, 0)   AS links_count,
      dl.main_process_id            AS company_process_id,
      dl.main_step_id               AS company_process_step_id,
      (SELECT r.id FROM public.company_process_step_requirements r
        WHERE r.document_id = d.id ORDER BY r.created_at DESC LIMIT 1) AS company_process_step_requirement_id,
      (SELECT pt.nome FROM public.company_processes cp
         JOIN public.process_types pt ON pt.id = cp.process_type_id
        WHERE cp.id = dl.main_process_id)                              AS process_type_name,
      (SELECT nome FROM public.company_process_steps WHERE id = dl.main_step_id) AS process_step_name,
      (d.data_validade IS NOT NULL
        AND d.data_validade >= CURRENT_DATE
        AND d.data_validade <= (CURRENT_DATE + 30))                    AS is_expiring,
      (d.data_validade IS NOT NULL AND d.data_validade < CURRENT_DATE) AS is_expired,
      d.is_demo,
      d.demo_batch_id,
      NULL::text                    AS criado_por_role,
      d.uploaded_by                 AS criado_por,
      d.created_at,
      d.updated_at
    FROM public.documents d
    JOIN public.clients c ON c.id = d.client_id
    LEFT JOIN doc_links dl ON dl.document_id = d.id
    WHERE d.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.document_requests dr2
         WHERE dr2.document_id = d.id AND dr2.deleted_at IS NULL
      )
  ),
  unified AS (
    SELECT * FROM req
    UNION ALL
    SELECT * FROM doc
  ),
  filtered AS (
    SELECT u.*
      FROM unified u
     WHERE (_client_id IS NULL OR u.client_id = _client_id)
       AND (_competencia IS NULL OR u.competencia = _competencia)
       AND (_categoria IS NULL OR u.categoria = _categoria)
       AND (_tipo IS NULL OR u.tipo = _tipo)
       AND (_departamento IS NULL OR u.departamento = _departamento)
       AND (_status IS NULL OR u.status = _status)
       AND (_action_owner IS NULL OR u.action_owner = _action_owner)
       AND (_responsavel_id IS NULL OR u.responsavel_id = _responsavel_id)
       AND (_origem IS NULL OR
            (_origem = 'staff'           AND u.item_kind = 'document_request' AND u.criado_por_role = 'staff') OR
            (_origem = 'client'          AND u.item_kind = 'document_request' AND u.criado_por_role = 'client') OR
            (_origem = 'document_avulso' AND u.item_kind = 'document'))
       AND (_prazo_from IS NULL OR u.prazo >= _prazo_from)
       AND (_prazo_to   IS NULL OR u.prazo <= _prazo_to)
       AND (_validade_from IS NULL OR u.data_validade >= _validade_from)
       AND (_validade_to   IS NULL OR u.data_validade <= _validade_to)
       AND (_tem_documento IS NULL OR u.has_document = _tem_documento)
       AND (_tem_vinculo   IS NULL OR u.has_process_link = _tem_vinculo)
       AND (NOT _somente_meus OR u.responsavel_id = v_uid OR u.criado_por = v_uid)
       AND (_include_demo OR NOT u.is_demo)
       AND (_demo_batch_id IS NULL OR u.demo_batch_id = _demo_batch_id)
       AND (
         v_pattern IS NULL OR
         u.empresa_nome        ILIKE v_pattern OR
         u.empresa_documento   ILIKE v_pattern OR
         u.titulo              ILIKE v_pattern OR
         u.tipo                ILIKE v_pattern OR
         u.document_name       ILIKE v_pattern OR
         u.competencia         ILIKE v_pattern OR
         u.process_type_name   ILIKE v_pattern
       )
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'aguardando' AND action_owner = 'client') AS aguardando_cliente,
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'aguardando' AND action_owner = 'staff')  AS aguardando_equipe,
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'recebido')                               AS recebidos,
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'reenviar')                               AS reenviar,
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'concluido')                              AS concluidos,
      count(*) FILTER (WHERE is_expiring AND NOT is_expired)                                                       AS vencendo,
      count(*) FILTER (WHERE is_expired)                                                                           AS vencidos,
      count(*) FILTER (WHERE has_process_link)                                                                     AS vinculados,
      count(*) FILTER (WHERE NOT has_process_link)                                                                 AS sem_vinculo,
      count(*)                                                                                                     AS todos
    FROM filtered
  ),
  scoped AS (
    SELECT * FROM filtered
     WHERE CASE _tab
       WHEN 'aguardando_cliente' THEN item_kind = 'document_request' AND status = 'aguardando' AND action_owner = 'client'
       WHEN 'recebidos'          THEN item_kind = 'document_request' AND status = 'recebido'
       WHEN 'reenviar'           THEN item_kind = 'document_request' AND status = 'reenviar'
       WHEN 'concluidos'         THEN item_kind = 'document_request' AND status = 'concluido'
       WHEN 'vinculados'         THEN has_process_link
       WHEN 'vencendo'           THEN is_expiring AND NOT is_expired
       WHEN 'vencidos'           THEN is_expired
       WHEN 'todos'              THEN true
     END
  ),
  page AS (
    SELECT
      item_id, item_kind, client_id, empresa_nome, empresa_documento,
      titulo, descricao_resumida, categoria, tipo, departamento,
      competencia, status, status_label, action_owner,
      prazo, data_validade, urgency,
      responsavel_id, responsavel_nome,
      document_id, document_name, document_storage_path,
      has_document, has_process_link, links_count,
      company_process_id, company_process_step_id, company_process_step_requirement_id,
      process_type_name, process_step_name,
      is_expiring, is_expired, is_demo, demo_batch_id,
      created_at, updated_at
    FROM scoped
    ORDER BY
      COALESCE(prazo, data_validade, updated_at::date, CURRENT_DATE) ASC,
      updated_at DESC,
      item_id ASC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY
        COALESCE(p.prazo, p.data_validade, p.updated_at::date, CURRENT_DATE) ASC,
        p.updated_at DESC, p.item_id ASC)
      FROM page p
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM scoped),
    'page', v_page,
    'page_size', v_page_size,
    'counts', jsonb_build_object(
      'aguardando_cliente', agg.aguardando_cliente,
      'aguardando_equipe',  agg.aguardando_equipe,
      'recebidos',          agg.recebidos,
      'reenviar',           agg.reenviar,
      'concluidos',         agg.concluidos,
      'vencendo',           agg.vencendo,
      'vencidos',           agg.vencidos,
      'vinculados',         agg.vinculados,
      'sem_vinculo',        agg.sem_vinculo,
      'todos',              agg.todos
    )
  ) INTO v_result FROM agg;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.list_document_workspace_paginated(
  text,int,int,text,uuid,text,text,text,text,text,text,uuid,text,date,date,date,date,boolean,boolean,boolean,boolean,uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_document_workspace_paginated(
  text,int,int,text,uuid,text,text,text,text,text,text,uuid,text,date,date,date,date,boolean,boolean,boolean,boolean,uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_document_workspace_paginated(
  text,int,int,text,uuid,text,text,text,text,text,text,uuid,text,date,date,date,date,boolean,boolean,boolean,boolean,uuid
) TO authenticated, service_role;

-- 4. RPC CLIENTE
CREATE OR REPLACE FUNCTION public.list_client_document_workspace_paginated(
  _section text     DEFAULT 'precisa_enviar',
  _page int         DEFAULT 1,
  _page_size int    DEFAULT 30,
  _client_id uuid   DEFAULT NULL,
  _search text      DEFAULT NULL,
  _competencia text DEFAULT NULL,
  _include_demo boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_page int := GREATEST(COALESCE(_page, 1), 1);
  v_page_size int := LEAST(GREATEST(COALESCE(_page_size, 30), 1), 100);
  v_offset int;
  v_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_pattern text := CASE WHEN v_search IS NULL THEN NULL ELSE '%' || v_search || '%' END;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF _section NOT IN ('precisa_enviar','historico') THEN
    RAISE EXCEPTION 'invalid section %', _section USING ERRCODE = '22023';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH
  visible_clients AS (
    SELECT cu.client_id
      FROM public.client_users cu
     WHERE cu.user_id = v_uid AND cu.ativo
  ),
  req AS (
    SELECT
      dr.id                             AS item_id,
      'document_request'::text          AS item_kind,
      dr.client_id,
      c.razao_social                    AS empresa_nome,
      COALESCE(c.cnpj, c.documento)     AS empresa_documento,
      dr.titulo                         AS titulo,
      dr.descricao                      AS descricao_resumida,
      dr.categoria,
      dr.tipo_solicitacao               AS tipo,
      dr.departamento,
      dr.competencia,
      dr.status                         AS status,
      dr.prazo,
      d.data_validade                   AS data_validade,
      dr.urgencia                       AS urgency,
      d.id                              AS document_id,
      d.nome                            AS document_name,
      (d.id IS NOT NULL)                AS has_document,
      (dr.company_process_id IS NOT NULL
        OR dr.company_process_step_id IS NOT NULL
        OR dr.company_process_step_requirement_id IS NOT NULL) AS has_process_link,
      dr.company_process_id,
      pt.nome                           AS process_type_name,
      (d.data_validade IS NOT NULL
        AND d.data_validade >= CURRENT_DATE
        AND d.data_validade <= (CURRENT_DATE + 30))  AS is_expiring,
      (d.data_validade IS NOT NULL AND d.data_validade < CURRENT_DATE) AS is_expired,
      dr.is_demo,
      dr.created_at,
      dr.updated_at,
      CASE
        WHEN dr.status IN ('concluido','cancelado') THEN 'none'
        WHEN dr.status = 'recebido' THEN 'staff'
        WHEN dr.status = 'reenviar' THEN 'client'
        WHEN dr.status = 'aguardando' THEN
          CASE
            WHEN dr.criado_por_role = 'client' THEN 'staff'
            WHEN dr.criado_por_role = 'staff'  THEN 'client'
            ELSE CASE
              WHEN dr.criado_por IS NOT NULL AND public.has_role(dr.criado_por, 'client'::app_role) THEN 'staff'
              ELSE 'client'
            END
          END
        ELSE 'none'
      END                                AS action_owner
    FROM public.document_requests dr
    JOIN visible_clients v ON v.client_id = dr.client_id
    JOIN public.clients c ON c.id = dr.client_id
    LEFT JOIN public.documents d ON d.id = dr.document_id AND d.deleted_at IS NULL
    LEFT JOIN public.company_processes cp ON cp.id = dr.company_process_id
    LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
    WHERE dr.deleted_at IS NULL
  ),
  filtered AS (
    SELECT r.*,
           public._doc_workspace_status_label_client(r.status, r.action_owner) AS status_label
      FROM req r
     WHERE (_client_id IS NULL OR r.client_id = _client_id)
       AND (_competencia IS NULL OR r.competencia = _competencia)
       AND (_include_demo OR NOT r.is_demo)
       AND (
         v_pattern IS NULL OR
         r.empresa_nome ILIKE v_pattern OR
         r.titulo ILIKE v_pattern OR
         r.tipo ILIKE v_pattern OR
         r.document_name ILIKE v_pattern OR
         r.competencia ILIKE v_pattern OR
         r.process_type_name ILIKE v_pattern
       )
  ),
  scoped AS (
    SELECT * FROM filtered
     WHERE CASE _section
       WHEN 'precisa_enviar' THEN
         (status = 'aguardando' AND action_owner = 'client')
         OR status = 'reenviar'
       WHEN 'historico' THEN
         status IN ('recebido','concluido','cancelado')
     END
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE status = 'aguardando' AND action_owner = 'client') AS aguardando_voce,
      count(*) FILTER (WHERE status = 'aguardando' AND action_owner = 'staff')  AS aguardando_contabilidade,
      count(*) FILTER (WHERE status = 'recebido')                               AS em_analise,
      count(*) FILTER (WHERE status = 'reenviar')                               AS precisa_reenviar,
      count(*) FILTER (WHERE status = 'concluido')                              AS concluidos,
      count(*) FILTER (WHERE status = 'cancelado')                              AS cancelados,
      count(*)                                                                  AS todos
    FROM filtered
  ),
  page AS (
    SELECT
      item_id, item_kind, client_id, empresa_nome, empresa_documento,
      titulo, descricao_resumida, categoria, tipo, departamento,
      competencia, status, status_label, action_owner,
      prazo, data_validade, urgency,
      document_id, document_name,
      has_document, has_process_link,
      company_process_id, process_type_name,
      is_expiring, is_expired, is_demo,
      created_at, updated_at
    FROM scoped
    ORDER BY
      COALESCE(prazo, data_validade, updated_at::date, CURRENT_DATE) ASC,
      updated_at DESC,
      item_id ASC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY
        COALESCE(p.prazo, p.data_validade, p.updated_at::date, CURRENT_DATE) ASC,
        p.updated_at DESC, p.item_id ASC)
      FROM page p
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM scoped),
    'page', v_page,
    'page_size', v_page_size,
    'counts', jsonb_build_object(
      'aguardando_voce',           agg.aguardando_voce,
      'aguardando_contabilidade',  agg.aguardando_contabilidade,
      'em_analise',                agg.em_analise,
      'precisa_reenviar',          agg.precisa_reenviar,
      'concluidos',                agg.concluidos,
      'cancelados',                agg.cancelados,
      'todos',                     agg.todos
    )
  ) INTO v_result FROM agg;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.list_client_document_workspace_paginated(
  text,int,int,uuid,text,text,boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_client_document_workspace_paginated(
  text,int,int,uuid,text,text,boolean
) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_client_document_workspace_paginated(
  text,int,int,uuid,text,text,boolean
) TO authenticated, service_role;

-- 5. DIAGNÓSTICO CHECKLIST
CREATE OR REPLACE FUNCTION public.workspace_checklist_precisa_solicitar_count(
  _client_id uuid DEFAULT NULL,
  _include_demo boolean DEFAULT true
) RETURNS TABLE(
  elegiveis bigint,
  ja_com_request_ativo bigint,
  ja_com_documento bigint,
  criterio text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $fn$
  WITH base AS (
    SELECT ci.*
      FROM public.client_checklist_items ci
     WHERE ci.deleted_at IS NULL
       AND ci.status = 'pendente'
       AND (_client_id IS NULL OR ci.client_id = _client_id)
       AND (_include_demo OR NOT ci.is_demo)
  )
  SELECT
    count(*) FILTER (WHERE b.document_request_id IS NULL AND b.document_id IS NULL) AS elegiveis,
    count(*) FILTER (WHERE b.document_request_id IS NOT NULL) AS ja_com_request_ativo,
    count(*) FILTER (WHERE b.document_id IS NOT NULL)         AS ja_com_documento,
    'status=pendente AND document_request_id IS NULL AND document_id IS NULL'::text AS criterio
  FROM base b;
$fn$;

REVOKE ALL ON FUNCTION public.workspace_checklist_precisa_solicitar_count(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workspace_checklist_precisa_solicitar_count(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.workspace_checklist_precisa_solicitar_count(uuid, boolean) TO authenticated, service_role;