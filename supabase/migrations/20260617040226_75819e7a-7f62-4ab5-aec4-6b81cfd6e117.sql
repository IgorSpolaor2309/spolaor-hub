
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON public.clients (deleted_at);

-- Acesso compartilhado passa a ignorar empresas excluídas para não-admins
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(_user_id)
    OR (
      EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND deleted_at IS NULL)
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
$$;

-- Função de soft delete (apenas admin)
CREATE OR REPLACE FUNCTION public.admin_soft_delete_client(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem excluir empresas' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clients
     SET deleted_at = COALESCE(deleted_at, now()),
         deleted_by = COALESCE(deleted_by, auth.uid()),
         status     = 'inactive'
   WHERE id = _client_id;

  UPDATE public.client_users
     SET ativo = false
   WHERE client_id = _client_id;
END;
$$;

-- Função para restaurar (apenas admin)
CREATE OR REPLACE FUNCTION public.admin_restore_client(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem restaurar empresas' USING ERRCODE = '42501';
  END IF;

  UPDATE public.clients
     SET deleted_at = NULL,
         deleted_by = NULL,
         status     = 'active'
   WHERE id = _client_id;
END;
$$;
