DROP POLICY IF EXISTS "Tasks: admin/collab update" ON public.pending_tasks;
CREATE POLICY "Tasks: admin/collab update" ON public.pending_tasks FOR UPDATE USING (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = pending_tasks.client_id AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Docs: admin/collab update" ON public.documents;
CREATE POLICY "Docs: admin/collab update" ON public.documents FOR UPDATE USING (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = documents.client_id AND c.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Inter: admin/collab insert" ON public.interactions;
CREATE POLICY "Inter: admin/collab insert" ON public.interactions FOR INSERT WITH CHECK (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = interactions.client_id AND c.user_id = auth.uid()
  )
);