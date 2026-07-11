
CREATE OR REPLACE FUNCTION public.admin_demo_orphan_auth_user_ids()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text
      FROM auth.users u
     WHERE u.email LIKE 'demo-%@homolog.spolaor.local'
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
END $$;

REVOKE ALL ON FUNCTION public.admin_demo_orphan_auth_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_demo_orphan_auth_user_ids() TO authenticated;
