
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_client_access(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_client_created() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_task_event() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_document_event() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_interaction() FROM public, anon, authenticated;
