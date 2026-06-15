
-- Storage policies for 'documents' bucket. Path format: <client_id>/<filename>
CREATE POLICY "Docs storage: read access" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.user_has_client_access(auth.uid(), (split_part(name,'/',1))::uuid)
);
CREATE POLICY "Docs storage: insert access" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.user_has_client_access(auth.uid(), (split_part(name,'/',1))::uuid)
);
CREATE POLICY "Docs storage: admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND public.is_admin(auth.uid()));
