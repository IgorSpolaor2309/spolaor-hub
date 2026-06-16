
-- Restringir policies a "authenticated" (eram públicas)
DROP POLICY IF EXISTS "Tasks: admin/collab update" ON public.pending_tasks;
CREATE POLICY "Tasks: admin/collab update"
ON public.pending_tasks FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = pending_tasks.client_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = pending_tasks.client_id AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Docs: admin/collab update" ON public.documents;
CREATE POLICY "Docs: admin/collab update"
ON public.documents FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = documents.client_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = documents.client_id AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Inter: admin/collab insert" ON public.interactions;
CREATE POLICY "Inter: admin/collab insert"
ON public.interactions FOR INSERT TO authenticated
WITH CHECK (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = interactions.client_id AND c.user_id = auth.uid()
  )
);

-- Profiles: reforçar update do próprio perfil, impedindo o usuário de
-- alterar campos sensíveis (status / must_change_password) por conta própria.
DROP POLICY IF EXISTS "Profiles: self update" ON public.profiles;
CREATE POLICY "Profiles: self update"
ON public.profiles FOR UPDATE TO authenticated
USING ( id = auth.uid() OR is_admin(auth.uid()) )
WITH CHECK (
  is_admin(auth.uid())
  OR (
    id = auth.uid()
    AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    AND must_change_password = (SELECT must_change_password FROM public.profiles WHERE id = auth.uid())
  )
);
