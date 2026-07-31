-- Fase E2.1 — fonte única da lista de conversas (metadados, sem conteúdo)
CREATE OR REPLACE FUNCTION public.list_chat_conversations_overview()
RETURNS TABLE (
  conversation_id uuid,
  client_id uuid,
  razao_social text,
  nome_fantasia text,
  last_message_at timestamptz,
  last_sender_role text,
  last_message_created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cc.id,
    cc.client_id,
    c.razao_social,
    c.nome_fantasia,
    cc.last_message_at,
    lm.sender_role,
    lm.created_at
  FROM public.chat_conversations cc
  JOIN public.clients c ON c.id = cc.client_id
  LEFT JOIN LATERAL (
    SELECT m.sender_role, m.created_at
    FROM public.chat_messages m
    WHERE m.conversation_id = cc.id
      AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 1
  ) lm ON true
  ORDER BY COALESCE(lm.created_at, cc.last_message_at) DESC NULLS LAST, c.razao_social ASC;
$$;

REVOKE ALL ON FUNCTION public.list_chat_conversations_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_chat_conversations_overview() TO authenticated;

-- Endurecimento de RLS em chat_conversations
DROP POLICY IF EXISTS "Chat conv: update" ON public.chat_conversations;
DROP POLICY IF EXISTS "Chat conv: insert" ON public.chat_conversations;

CREATE POLICY "Chat conv: insert (staff)"
  ON public.chat_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_client_access(auth.uid(), client_id)
    AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'collaborator'))
  );

REVOKE UPDATE ON public.chat_conversations FROM authenticated;
GRANT SELECT, INSERT ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;