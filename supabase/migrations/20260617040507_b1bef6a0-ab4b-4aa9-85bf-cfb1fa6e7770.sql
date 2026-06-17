
DROP POLICY IF EXISTS "Clients: linked read" ON public.clients;
CREATE POLICY "Clients: linked read"
ON public.clients
FOR SELECT
USING (
  deleted_at IS NULL AND (
    owner_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.client_users cu
       WHERE cu.client_id = clients.id
         AND cu.user_id   = auth.uid()
         AND cu.ativo     = true
    )
    OR EXISTS (
      SELECT 1
        FROM public.client_collaborators cc
        JOIN public.collaborators c ON c.id = cc.collaborator_id
       WHERE cc.client_id = clients.id
         AND c.user_id    = auth.uid()
    )
  )
);
