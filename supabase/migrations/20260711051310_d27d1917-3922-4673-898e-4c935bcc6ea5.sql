
REVOKE EXECUTE ON FUNCTION public.admin_demo_summary() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_demo_create_environment(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_demo_wipe(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_demo_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_demo_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_demo_create_environment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_demo_wipe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_demo_reset(text) TO authenticated;
