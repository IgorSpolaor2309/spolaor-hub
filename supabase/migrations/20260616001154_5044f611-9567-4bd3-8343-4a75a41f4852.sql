
-- 1) Restrict user_roles writes to admins (prevent privilege escalation)
CREATE POLICY "Roles: admin insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Roles: admin update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Roles: admin delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- 2) Storage UPDATE policy for documents bucket
CREATE POLICY "Docs storage: update access" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), (split_part(name, '/', 1))::uuid)))
  WITH CHECK (bucket_id = 'documents' AND (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), (split_part(name, '/', 1))::uuid)));

-- 3) Revoke EXECUTE from authenticated on SECURITY DEFINER trigger-only functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_first_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_client_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_task_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_document_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_interaction() FROM PUBLIC, anon, authenticated;
