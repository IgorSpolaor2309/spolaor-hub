
-- 1) Coluna must_change_password
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 2) RPC para o próprio usuário marcar a troca como concluída
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET must_change_password = false WHERE id = auth.uid();
END; $$;

REVOKE ALL ON FUNCTION public.mark_password_changed() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;

-- 3) Corrigir policy de leitura dos clientes para colaboradores
DROP POLICY IF EXISTS "Clients: linked read" ON public.clients;
CREATE POLICY "Clients: linked read"
ON public.clients FOR SELECT
TO authenticated
USING (
  owner_profile_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = clients.id AND c.user_id = auth.uid()
  )
);
