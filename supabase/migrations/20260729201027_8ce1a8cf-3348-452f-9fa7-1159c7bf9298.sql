CREATE OR REPLACE FUNCTION public.workspace_checklist_precisa_solicitar_list(
  _client_id uuid DEFAULT NULL,
  _competencia text DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_demo boolean DEFAULT true,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_size integer := LEAST(GREATEST(COALESCE(_page_size, 20), 1), 100);
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'collaborator')) THEN
    RAISE EXCEPTION 'Acesso restrito à equipe.' USING ERRCODE = '42501';
  END IF;
  v_admin := public.has_role(v_uid, 'admin');

  WITH base AS (
    SELECT
      ci.id,
      ci.client_id,
      ci.titulo,
      ci.categoria,
      ci.competencia,
      ci.prazo,
      ci.origem,
      ci.is_demo,
      ci.demo_batch_id,
      ci.responsavel_profile_id,
      ci.observacao,
      ci.created_at,
      COALESCE(c.nome_fantasia, c.razao_social) AS empresa_nome,
      c.documento AS empresa_documento,
      p.full_name AS responsavel_nome
    FROM public.client_checklist_items ci
    JOIN public.clients c ON c.id = ci.client_id AND c.deleted_at IS NULL
    LEFT JOIN public.profiles p ON p.id = ci.responsavel_profile_id
    WHERE ci.deleted_at IS NULL
      AND ci.status = 'pendente'
      AND ci.document_request_id IS NULL
      AND ci.document_id IS NULL
      AND (_client_id IS NULL OR ci.client_id = _client_id)
      AND (_competencia IS NULL OR ci.competencia = _competencia)
      AND (_include_demo OR NOT ci.is_demo)
      AND (
        _search IS NULL OR _search = ''
        OR ci.titulo ILIKE '%' || _search || '%'
        OR COALESCE(c.nome_fantasia, c.razao_social) ILIKE '%' || _search || '%'
      )
      AND (
        v_admin
        OR c.owner_profile_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.client_collaborators cc
          JOIN public.collaborators col ON col.id = cc.collaborator_id
          WHERE cc.client_id = ci.client_id AND col.user_id = v_uid
        )
      )
  ), counted AS (
    SELECT COUNT(*)::int AS total FROM base
  ), paged AS (
    SELECT * FROM base
    ORDER BY prazo NULLS LAST, created_at DESC, id
    LIMIT v_size OFFSET (v_page - 1) * v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'id', paged.id,
             'client_id', paged.client_id,
             'titulo', paged.titulo,
             'categoria', paged.categoria,
             'competencia', paged.competencia,
             'prazo', paged.prazo,
             'origem', paged.origem,
             'is_demo', paged.is_demo,
             'demo_batch_id', paged.demo_batch_id,
             'responsavel_profile_id', paged.responsavel_profile_id,
             'responsavel_nome', paged.responsavel_nome,
             'observacao', paged.observacao,
             'created_at', paged.created_at,
             'empresa_nome', paged.empresa_nome,
             'empresa_documento', paged.empresa_documento
           )
           ORDER BY paged.prazo NULLS LAST, paged.created_at DESC
         ), '[]'::jsonb)
    INTO v_total, v_rows
    FROM paged;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', v_page,
    'page_size', v_size
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.workspace_checklist_precisa_solicitar_list(uuid, text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_checklist_precisa_solicitar_list(uuid, text, text, boolean, integer, integer) TO authenticated;