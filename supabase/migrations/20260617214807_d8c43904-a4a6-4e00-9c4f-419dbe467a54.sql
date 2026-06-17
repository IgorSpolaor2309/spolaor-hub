REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_client_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profiles_shares_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_user_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_staff_user_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_label(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_find_profile_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_client_with_user(jsonb, uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_soft_delete_client(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_client(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_first_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_client_created() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_interaction() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_task_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_document_event() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_document_insert_notify() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_document_request_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_tax_guide_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_chat_message_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_document_requests_client_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_tax_guides_client_update() TO service_role;