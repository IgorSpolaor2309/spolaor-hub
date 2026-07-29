CREATE OR REPLACE FUNCTION public.client_list_pending_actions(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 30,
  _client_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _kind text DEFAULT NULL,
  _include_demo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_page int := GREATEST(COALESCE(_page, 1), 1);
  v_page_size int := LEAST(GREATEST(COALESCE(_page_size, 30), 1), 100);
  v_offset int;
  v_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_pattern text := CASE WHEN NULLIF(btrim(COALESCE(_search, '')), '') IS NULL THEN NULL ELSE '%' || btrim(_search) || '%' END;
  v_kind text := NULLIF(btrim(COALESCE(_kind, '')), '');
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('document_request','tax_guide') THEN
    RAISE EXCEPTION 'invalid kind %', v_kind USING ERRCODE = '22023';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH
  visible_clients AS (
    SELECT cu.client_id
      FROM public.client_users cu
      JOIN public.clients c ON c.id = cu.client_id
     WHERE cu.user_id = v_uid
       AND cu.ativo
       AND c.deleted_at IS NULL
       AND COALESCE(c.status,'active') <> 'inactive'
  ),
  reqs AS (
    SELECT
      dr.id                          AS item_id,
      'document_request'::text       AS item_kind,
      dr.client_id,
      c.razao_social                 AS empresa_nome,
      COALESCE(c.nome_fantasia, c.razao_social) AS empresa_label,
      dr.titulo                      AS titulo,
      dr.categoria                   AS categoria,
      dr.competencia                 AS competencia,
      dr.status                      AS status,
      CASE dr.status WHEN 'reenviar' THEN 'Reenvio solicitado' ELSE 'Aguardando envio' END AS status_label,
      dr.prazo                       AS prazo,
      dr.urgencia                    AS urgency,
      dr.is_demo                     AS is_demo,
      dr.updated_at                  AS updated_at,
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
      END                            AS action_owner
    FROM public.document_requests dr
    JOIN visible_clients v ON v.client_id = dr.client_id
    JOIN public.clients c ON c.id = dr.client_id
    WHERE dr.deleted_at IS NULL
      AND dr.status IN ('aguardando','reenviar')
  ),
  guides AS (
    SELECT
      tg.id                          AS item_id,
      'tax_guide'::text              AS item_kind,
      tg.client_id,
      c.razao_social                 AS empresa_nome,
      COALESCE(c.nome_fantasia, c.razao_social) AS empresa_label,
      COALESCE(tg.tipo, 'Guia')      AS titulo,
      'Guia/Imposto'::text           AS categoria,
      tg.competencia                 AS competencia,
      tg.status                      AS status,
      'Aguardando comprovante'::text AS status_label,
      tg.vencimento                  AS prazo,
      NULL::text                     AS urgency,
      tg.is_demo                     AS is_demo,
      tg.updated_at                  AS updated_at,
      'client'::text                 AS action_owner
    FROM public.tax_guides tg
    JOIN visible_clients v ON v.client_id = tg.client_id
    JOIN public.clients c ON c.id = tg.client_id
    WHERE tg.deleted_at IS NULL
      AND tg.comprovante_path IS NULL
      AND tg.storage_path IS NOT NULL
      AND COALESCE(tg.status,'') NOT IN ('paga','pago','cancelada','cancelado')
  ),
  unioned AS (
    SELECT * FROM reqs WHERE action_owner = 'client'
    UNION ALL
    SELECT * FROM guides
  ),
  filtered AS (
    SELECT u.* FROM unioned u
     WHERE (_client_id IS NULL OR u.client_id = _client_id)
       AND (_include_demo OR NOT u.is_demo)
       AND (v_kind IS NULL OR u.item_kind = v_kind)
       AND (
         v_pattern IS NULL
         OR u.titulo ILIKE v_pattern
         OR u.empresa_label ILIKE v_pattern
         OR u.categoria ILIKE v_pattern
         OR u.competencia ILIKE v_pattern
       )
  ),
  agg AS (
    SELECT
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'aguardando') AS aguardando_envio,
      count(*) FILTER (WHERE item_kind = 'document_request' AND status = 'reenviar')   AS reenvio_solicitado,
      count(*) FILTER (WHERE item_kind = 'tax_guide')                                  AS guias,
      count(*) FILTER (WHERE prazo IS NOT NULL AND prazo < CURRENT_DATE)               AS atrasados,
      count(*)                                                                          AS todos
    FROM filtered
  ),
  page AS (
    SELECT
      item_id, item_kind, client_id, empresa_nome, empresa_label,
      titulo, categoria, competencia, status, status_label,
      prazo, urgency, is_demo, action_owner, updated_at
    FROM filtered
    ORDER BY COALESCE(prazo, CURRENT_DATE + 3650) ASC, updated_at DESC, item_id ASC
    LIMIT v_page_size OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY
        COALESCE(p.prazo, CURRENT_DATE + 3650) ASC, p.updated_at DESC, p.item_id ASC)
      FROM page p
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'page', v_page,
    'page_size', v_page_size,
    'counts', jsonb_build_object(
      'aguardando_envio',   agg.aguardando_envio,
      'reenvio_solicitado', agg.reenvio_solicitado,
      'guias',              agg.guias,
      'atrasados',          agg.atrasados,
      'todos',              agg.todos
    )
  ) INTO v_result FROM agg;

  RETURN v_result;
END $function$;

REVOKE ALL ON FUNCTION public.client_list_pending_actions(integer,integer,uuid,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_list_pending_actions(integer,integer,uuid,text,text,boolean) TO authenticated;