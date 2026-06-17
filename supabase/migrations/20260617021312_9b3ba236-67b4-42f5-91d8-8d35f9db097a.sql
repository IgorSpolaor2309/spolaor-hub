
-- 1) Notifications: remove user-side insert (server-only via SECURITY DEFINER notify_user)
DROP POLICY IF EXISTS "Notif: own insert" ON public.notifications;

-- 2) Profiles: scoped read for users sharing a client context
CREATE OR REPLACE FUNCTION public.profiles_shares_client(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    -- target is a client owner of a client the viewer can access
    SELECT 1 FROM public.clients c
    WHERE c.owner_profile_id = _target
      AND public.user_has_client_access(_viewer, c.id)
  ) OR EXISTS (
    -- target is a collaborator linked to a client the viewer can access
    SELECT 1
    FROM public.collaborators col
    JOIN public.client_collaborators cc ON cc.collaborator_id = col.id
    WHERE col.user_id = _target
      AND public.user_has_client_access(_viewer, cc.client_id)
  ) OR EXISTS (
    -- target is an admin (staff visible to everyone in the workspace context)
    SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "Profiles: shared context select" ON public.profiles;
CREATE POLICY "Profiles: shared context select"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_admin(auth.uid())
  OR public.profiles_shares_client(auth.uid(), id)
);

DROP POLICY IF EXISTS "Profiles: self select" ON public.profiles;

-- 3) Realtime: lock down broadcast/presence channels (postgres_changes keeps using table RLS)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Realtime: admin only broadcast read" ON realtime.messages;
CREATE POLICY "Realtime: admin only broadcast read"
ON realtime.messages FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Realtime: admin only broadcast write" ON realtime.messages;
CREATE POLICY "Realtime: admin only broadcast write"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));
