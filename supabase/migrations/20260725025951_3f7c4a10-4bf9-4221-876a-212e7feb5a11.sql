-- Hardening: EXECUTE grants em funções SECURITY DEFINER do módulo Processos.
-- Defesa em profundidade — item ALTO #13 da auditoria.
-- Idempotente: apenas REVOKE/GRANT. Nenhuma migration antiga é modificada.

-- Grupo 1 — Trigger functions (chamadas apenas pelo engine): sem GRANT nenhum.
REVOKE ALL ON FUNCTION public.tg_company_processes_event()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_company_process_steps_event()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_company_process_steps_recalc()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_process_document_link()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_document_request_process_link() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_document_request_process_link()      FROM PUBLIC, anon, authenticated;

-- Grupo 2 — RPCs administrativas do módulo (frontend admin).
REVOKE ALL ON FUNCTION public.admin_duplicate_process_type(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_duplicate_process_type(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_process_models_stats()                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_process_models_stats()                          TO authenticated;

REVOKE ALL ON FUNCTION public.admin_sync_process_visibility(uuid, text, boolean)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_sync_process_visibility(uuid, text, boolean)    TO authenticated;

-- Grupo 3 — RPCs de operação (admin + collaborator).
REVOKE ALL ON FUNCTION public.open_company_process(uuid, uuid, uuid, date, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.open_company_process(uuid, uuid, uuid, date, text, text, boolean, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.recalc_company_process(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.recalc_company_process(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.processos_indicadores() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.processos_indicadores() TO authenticated;

-- Grupo 4 — RPCs do portal do cliente (já eram authenticated-only; reforço).
REVOKE ALL ON FUNCTION public.client_list_processes()      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_list_processes()      TO authenticated;

REVOKE ALL ON FUNCTION public.client_process_detail(uuid)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_process_detail(uuid)  TO authenticated;

REVOKE ALL ON FUNCTION public.client_process_timeline(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_process_timeline(uuid) TO authenticated;

-- Grupo 5 — Manutenção/cron: apenas service_role.
REVOKE ALL ON FUNCTION public.processos_notificar_vencimentos() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.processos_notificar_vencimentos() TO service_role;