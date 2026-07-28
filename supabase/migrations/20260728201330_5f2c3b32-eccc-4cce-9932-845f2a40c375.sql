DROP FUNCTION IF EXISTS public.workspace_checklist_precisa_solicitar_count(uuid, boolean);

CREATE OR REPLACE FUNCTION public.workspace_checklist_precisa_solicitar_count(
  _client_id    uuid    DEFAULT NULL,
  _include_demo boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'elegiveis',            COUNT(*) FILTER (WHERE ci.status = 'pendente'
                                              AND ci.document_request_id IS NULL
                                              AND ci.document_id IS NULL),
    'ja_com_request_ativo', COUNT(*) FILTER (WHERE ci.status = 'pendente'
                                              AND ci.document_request_id IS NOT NULL),
    'ja_com_documento',     COUNT(*) FILTER (WHERE ci.status = 'pendente'
                                              AND ci.document_id IS NOT NULL),
    'criterio',             'status=pendente AND document_request_id IS NULL AND document_id IS NULL'
  )
  FROM public.client_checklist_items ci
  WHERE ci.deleted_at IS NULL
    AND (_client_id IS NULL OR ci.client_id = _client_id)
    AND (_include_demo OR NOT ci.is_demo);
$$;

REVOKE ALL ON FUNCTION public.workspace_checklist_precisa_solicitar_count(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_checklist_precisa_solicitar_count(uuid, boolean) TO authenticated, service_role;