
-- 1) Fonte canônica do responsável interno: mantém a regra, adiciona guarda de acesso
CREATE OR REPLACE FUNCTION public.resolve_client_internal_responsible(p_client_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id
    FROM public.client_collaborators cc
    JOIN public.collaborators col ON col.id = cc.collaborator_id
    JOIN public.profiles p ON p.id = col.user_id
    JOIN public.clients c ON c.id = cc.client_id
   WHERE cc.client_id = p_client_id
     AND (
       auth.uid() IS NULL
       OR (
         public.current_actor_role() IN ('admin','collaborator')
         AND public.user_has_client_access(auth.uid(), p_client_id)
       )
     )
     AND COALESCE(col.status,'active') = 'active'
     AND COALESCE(p.status,'active') = 'active'
     AND COALESCE(p.is_demo,false) = COALESCE(c.is_demo,false)
     AND (NOT COALESCE(c.is_demo,false) OR c.demo_batch_id IS NOT DISTINCT FROM p.demo_batch_id)
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role IN ('admin','collaborator'))
   ORDER BY cc.is_primary DESC, cc.created_at ASC
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.resolve_client_internal_responsible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_client_internal_responsible(uuid) TO authenticated, service_role;

-- 2) Amplia a RPC existente da lista de conversas (sem nova RPC)
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
   waiting_since timestamp with time zone
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
    CASE WHEN lm.sender_role = 'client' THEN w.waiting_since END
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
