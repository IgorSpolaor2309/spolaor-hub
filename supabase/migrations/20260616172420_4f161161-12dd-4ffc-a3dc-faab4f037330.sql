
-- 1) Collaborators: self-update policy (scoped)
CREATE POLICY "Collab: self update"
  ON public.collaborators
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) Notifications: explicit INSERT policy locked to own user_id
CREATE POLICY "Notif: own insert"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3) Tax guides: restrict client UPDATE WITH CHECK to status = 'paga' only
DROP POLICY IF EXISTS "Client may attach payment proof" ON public.tax_guides;
CREATE POLICY "Client may attach payment proof"
  ON public.tax_guides
  FOR UPDATE
  TO authenticated
  USING (
    (NOT is_admin(auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = tax_guides.client_id
        AND cl.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (status = 'paga');
