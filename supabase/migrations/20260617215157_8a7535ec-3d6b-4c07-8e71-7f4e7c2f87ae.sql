DROP POLICY IF EXISTS "Clients: linked read" ON public.clients;
CREATE POLICY "Clients: linked read"
ON public.clients
FOR SELECT
TO authenticated
USING (public.user_has_client_access(auth.uid(), id));