CREATE OR REPLACE FUNCTION public.log_legacy_route_access(
  _route text,
  _action text DEFAULT 'view'::text,
  _client_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_role   text;
  v_action text;
  v_client uuid := NULL;
  v_ok     boolean := false;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF _route IS NULL OR _route NOT IN ('/solicitacoes', '/validades') THEN
    RAISE EXCEPTION 'unsupported legacy route';
  END IF;

  v_action := lower(COALESCE(NULLIF(TRIM(_action), ''), 'view'));
  IF v_action NOT IN ('view', 'open_central', 'redirect') THEN
    RAISE EXCEPTION 'unsupported legacy action';
  END IF;

  -- Papel sempre derivado no servidor; valor enviado pelo cliente é ignorado.
  v_role := CASE
    WHEN public.has_role(v_uid, 'admin'::app_role) THEN 'admin'
    WHEN public.has_role(v_uid, 'collaborator'::app_role) THEN 'collaborator'
    WHEN public.has_role(v_uid, 'client'::app_role) THEN 'client'
    ELSE 'unknown'
  END;

  -- Empresa só é registrada quando o usuário tem acesso legítimo a ela.
  IF _client_id IS NOT NULL THEN
    IF v_role = 'admin' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.clients c
         WHERE c.id = _client_id AND c.deleted_at IS NULL
      ) INTO v_ok;
    ELSIF v_role = 'collaborator' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.client_collaborators cc
          JOIN public.collaborators col ON col.id = cc.collaborator_id
          JOIN public.clients c ON c.id = cc.client_id
         WHERE cc.client_id = _client_id
           AND col.user_id = v_uid
           AND c.deleted_at IS NULL
      ) INTO v_ok;
    ELSIF v_role = 'client' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.client_users cu
          JOIN public.clients c ON c.id = cu.client_id
         WHERE cu.client_id = _client_id
           AND cu.user_id = v_uid
           AND cu.ativo = true
           AND c.deleted_at IS NULL
      ) INTO v_ok;
    END IF;

    IF v_ok THEN
      v_client := _client_id;
    END IF;
  END IF;

  INSERT INTO public.legacy_route_access_log (user_id, user_role, route, action, client_id)
  VALUES (v_uid, v_role, _route, v_action, v_client)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

ALTER FUNCTION public.log_legacy_route_access(text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.log_legacy_route_access(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_legacy_route_access(text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_legacy_route_access(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_legacy_route_access(text, text, uuid) TO service_role;