-- A2.2 (reforço): client_month_status estritamente somente leitura para a aplicação
REVOKE TRUNCATE ON public.client_month_status FROM authenticated;
REVOKE TRUNCATE ON public.client_month_status FROM anon;
REVOKE ALL ON public.client_month_status FROM anon;
GRANT ALL ON public.client_month_status TO service_role;
