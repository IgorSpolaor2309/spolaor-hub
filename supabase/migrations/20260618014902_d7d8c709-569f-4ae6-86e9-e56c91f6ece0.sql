-- 1. Fix user_has_client_access to exclude inactive collaborators
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id uuid, _client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin(_user_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.clients
         WHERE id = _client_id
           AND deleted_at IS NULL
           AND COALESCE(status, 'active') <> 'inactive'
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.clients
           WHERE id = _client_id AND owner_profile_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.client_users cu
           WHERE cu.client_id = _client_id
             AND cu.user_id   = _user_id
             AND cu.ativo     = true
        )
        OR EXISTS (
          SELECT 1
            FROM public.client_collaborators cc
            JOIN public.collaborators c ON c.id = cc.collaborator_id
           WHERE cc.client_id = _client_id
             AND c.user_id    = _user_id
             AND COALESCE(c.status, 'active') = 'active'
        )
      )
    )
$function$;

-- 2. Allow authenticated users to subscribe to Realtime topics scoped to their own uid
-- Topic convention: "user:<uid>" for personal notifications, "client:<client_id>" for client-scoped streams
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='Authenticated users can subscribe to own topics') THEN
    DROP POLICY "Authenticated users can subscribe to own topics" ON realtime.messages;
  END IF;
END $$;

CREATE POLICY "Authenticated users can subscribe to own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- personal user topic
  (realtime.topic() = 'user:' || auth.uid()::text)
  OR
  -- client-scoped topic the user has access to
  (
    realtime.topic() LIKE 'client:%'
    AND public.user_has_client_access(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  )
);
