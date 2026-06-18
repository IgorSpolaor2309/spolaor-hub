
-- 1) document_requests: limit staff UPDATE policy to admin or collaborator
DROP POLICY IF EXISTS "Admin and assigned collab update doc requests" ON public.document_requests;
CREATE POLICY "Admin and assigned collab update doc requests"
  ON public.document_requests FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'collaborator') AND public.user_has_client_access(auth.uid(), client_id))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'collaborator') AND public.user_has_client_access(auth.uid(), client_id))
  );

-- 2) tax_guides: same restriction
DROP POLICY IF EXISTS "Admin and assigned collab update guides" ON public.tax_guides;
CREATE POLICY "Admin and assigned collab update guides"
  ON public.tax_guides FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'collaborator') AND public.user_has_client_access(auth.uid(), client_id))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'collaborator') AND public.user_has_client_access(auth.uid(), client_id))
  );

-- 3) pending_tasks: same restriction
DROP POLICY IF EXISTS "Tasks: admin/collab update" ON public.pending_tasks;
CREATE POLICY "Tasks: admin/collab update"
  ON public.pending_tasks FOR UPDATE
  USING (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'collaborator') AND public.user_has_client_access(auth.uid(), client_id))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'collaborator') AND public.user_has_client_access(auth.uid(), client_id))
  );

-- 4) collaborators: allow client users to read collaborator rows assigned to their company
DROP POLICY IF EXISTS "Collab: client of same company read" ON public.collaborators;
CREATE POLICY "Collab: client of same company read"
  ON public.collaborators FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_collaborators cc
      WHERE cc.collaborator_id = collaborators.id
        AND public.user_has_client_access(auth.uid(), cc.client_id)
    )
  );
