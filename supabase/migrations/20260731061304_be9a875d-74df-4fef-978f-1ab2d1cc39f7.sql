DROP FUNCTION IF EXISTS public.list_chat_conversations_overview();

CREATE OR REPLACE FUNCTION public.list_chat_conversations_overview()
 RETURNS TABLE(
   conversation_id uuid,
   client_id uuid,
   razao_social text,
   nome_fantasia text,
   last_message_at timestamp with time zone,
   last_sender_role text,
   last_message_created_at timestamp with time zone,
   responsible_profile_id uuid,
   responsible_name text,
   waiting_since timestamp with time zone,
   client_operational_status text
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH actor AS (SELECT public.current_actor_role() AS role)
  SELECT
    cc.id,
    cc.client_id,
    c.razao_social,
    c.nome_fantasia,
    cc.last_message_at,
    lm.sender_role,
    lm.created_at,
    resp.id,
    resp.full_name,
    CASE WHEN lm.sender_role = 'client' THEN w.waiting_since END,
    CASE WHEN a.role IN ('admin','collaborator') THEN
      CASE
        WHEN c.deleted_at IS NOT NULL THEN 'deleted'
        WHEN c.status = 'active' THEN 'active'
        ELSE 'inactive'
      END
    END
  FROM public.chat_conversations cc
  JOIN public.clients c ON c.id = cc.client_id
  CROSS JOIN actor a
  LEFT JOIN LATERAL (
    SELECT m.sender_role, m.created_at
    FROM public.chat_messages m
    WHERE m.conversation_id = cc.id
      AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT p.id, p.full_name
      FROM public.profiles p
     WHERE a.role IN ('admin','collaborator')
       AND p.id = public.resolve_client_internal_responsible(cc.client_id)
  ) resp ON true
  LEFT JOIN LATERAL (
    SELECT MIN(m.created_at) AS waiting_since
      FROM public.chat_messages m
     WHERE a.role IN ('admin','collaborator')
       AND lm.sender_role = 'client'
       AND m.conversation_id = cc.id
       AND m.deleted_at IS NULL
       AND m.sender_role = 'client'
       AND m.created_at > COALESCE(
         (SELECT MAX(s.created_at)
            FROM public.chat_messages s
           WHERE s.conversation_id = cc.id
             AND s.deleted_at IS NULL
             AND s.sender_role IN ('admin','collaborator')),
         '-infinity'::timestamptz)
  ) w ON true
  ORDER BY COALESCE(lm.created_at, cc.last_message_at) DESC NULLS LAST, c.razao_social ASC;
$function$;

REVOKE ALL ON FUNCTION public.list_chat_conversations_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_chat_conversations_overview() TO authenticated, service_role;