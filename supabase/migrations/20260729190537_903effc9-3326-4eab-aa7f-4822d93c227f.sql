ALTER FUNCTION public._competence_check_transition(p_from text, p_to text) SET search_path = public;

ALTER POLICY drli_update_staff ON public.document_request_link_issues
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = document_request_link_issues.client_id
        AND c.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = document_request_link_issues.client_id
        AND c.owner_profile_id = auth.uid()
    )
  );