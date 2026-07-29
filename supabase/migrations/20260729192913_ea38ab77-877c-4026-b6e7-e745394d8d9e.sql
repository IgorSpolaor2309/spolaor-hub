CREATE OR REPLACE FUNCTION public.list_checklist_responsibles(_client_id uuid DEFAULT NULL)
RETURNS TABLE (profile_id uuid, full_name text, email text, is_admin boolean, linked_to_client boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS profile_id,
    p.full_name,
    p.email,
    public.has_role(p.id, 'admin') AS is_admin,
    (_client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators col ON col.id = cc.collaborator_id
      WHERE cc.client_id = _client_id AND col.user_id = p.id
    )) AS linked_to_client
  FROM public.profiles p
  WHERE p.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.id AND ur.role IN ('admin', 'collaborator')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.collaborators col2
      WHERE col2.user_id = p.id AND col2.status <> 'active'
        AND NOT public.has_role(p.id, 'admin')
    )
  ORDER BY 5 DESC, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_checklist_responsibles(uuid) TO authenticated;