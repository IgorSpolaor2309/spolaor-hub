-- Fix: 42702 "column reference 'id' is ambiguous" em client_list_processes.
-- Causa: OUT params do RETURNS TABLE (id, client_id, status, ...) colidem com
-- colunas de mesmo nome em `SELECT id FROM minhas` dentro das CTEs.
-- Correção: qualificar todas as referências com alias da CTE/tabela.

CREATE OR REPLACE FUNCTION public.client_list_processes()
 RETURNS TABLE(id uuid, client_id uuid, empresa text, tipo_nome text, status text, motivo_espera text, prazo_final date, data_abertura timestamp with time zone, progresso_total integer, progresso_concluido integer, aguardando_minha_acao boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  minhas AS (
    SELECT cp.id            AS proc_id,
           cp.client_id     AS proc_client_id,
           cp.process_type_id,
           cp.status        AS proc_status,
           cp.motivo_espera AS proc_motivo_espera,
           cp.prazo_final   AS proc_prazo_final,
           cp.created_at    AS proc_created_at
      FROM public.company_processes cp
     WHERE public.user_has_client_access(auth.uid(), cp.client_id)
       AND cp.status <> 'cancelado'
  ),
  progresso AS (
    SELECT s.company_process_id,
           count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false))::int AS total,
           count(*) FILTER (WHERE COALESCE(s.visivel_cliente,false) AND s.status = 'concluida')::int AS done
      FROM public.company_process_steps s
     WHERE s.company_process_id IN (SELECT m.proc_id FROM minhas m)
     GROUP BY s.company_process_id
  ),
  solic AS (
    SELECT dr.company_process_id,
           bool_or(dr.status IN ('pendente','solicitado','reenviar','aguardando_cliente')) AS pend
      FROM public.document_requests dr
     WHERE dr.deleted_at IS NULL
       AND dr.company_process_id IN (SELECT m.proc_id FROM minhas m)
     GROUP BY dr.company_process_id
  )
  SELECT m.proc_id,
         m.proc_client_id,
         public.client_label(m.proc_client_id),
         pt.nome,
         m.proc_status,
         m.proc_motivo_espera,
         m.proc_prazo_final,
         m.proc_created_at,
         COALESCE(p.total,0),
         COALESCE(p.done,0),
         (m.proc_status = 'aguardando_cliente' OR COALESCE(s.pend,false)) AS aguardando_minha_acao
    FROM minhas m
    LEFT JOIN public.process_types pt ON pt.id = m.process_type_id
    LEFT JOIN progresso p ON p.company_process_id = m.proc_id
    LEFT JOIN solic s     ON s.company_process_id = m.proc_id
   ORDER BY m.proc_created_at DESC;
END $function$;

-- Reafirmar grants (mesma política do módulo).
REVOKE ALL ON FUNCTION public.client_list_processes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_list_processes() TO authenticated;