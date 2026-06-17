
-- 1) user_has_client_access: para não-admin, exigir empresa ativa (status <> 'inactive') e não excluída
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin(_user_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.clients
         WHERE id = _client_id
           AND deleted_at IS NULL
           AND COALESCE(status, 'active') <> 'inactive'
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.clients
           WHERE id = _client_id AND owner_profile_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.client_users cu
           WHERE cu.client_id = _client_id
             AND cu.user_id   = _user_id
             AND cu.ativo     = true
        )
        OR EXISTS (
          SELECT 1
            FROM public.client_collaborators cc
            JOIN public.collaborators c ON c.id = cc.collaborator_id
           WHERE cc.client_id = _client_id
             AND c.user_id    = _user_id
        )
      )
    )
$function$;

-- 2) client_user_ids: não notificar/listar usuários de empresas inativas/excluídas
CREATE OR REPLACE FUNCTION public.client_user_ids(_client_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT u FROM (
    SELECT c.owner_profile_id AS u
      FROM public.clients c
     WHERE c.id = _client_id
       AND c.owner_profile_id IS NOT NULL
       AND c.deleted_at IS NULL
       AND COALESCE(c.status,'active') <> 'inactive'
    UNION
    SELECT cu.user_id AS u
      FROM public.client_users cu
      JOIN public.clients c ON c.id = cu.client_id
     WHERE cu.client_id = _client_id
       AND cu.ativo = true
       AND cu.user_id IS NOT NULL
       AND c.deleted_at IS NULL
       AND COALESCE(c.status,'active') <> 'inactive'
  ) s WHERE u IS NOT NULL;
$function$;

-- 3) client_staff_user_ids: também respeita empresa não-excluída/inativa para colaboradores
CREATE OR REPLACE FUNCTION public.client_staff_user_ids(_client_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT u FROM (
    SELECT user_id AS u FROM public.user_roles WHERE role = 'admin'
    UNION
    SELECT c.user_id
      FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      JOIN public.clients cl ON cl.id = cc.client_id
     WHERE cc.client_id = _client_id
       AND c.user_id IS NOT NULL
       AND cl.deleted_at IS NULL
       AND COALESCE(cl.status,'active') <> 'inactive'
  ) s WHERE u IS NOT NULL;
$function$;
