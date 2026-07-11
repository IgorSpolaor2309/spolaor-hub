
-- ============ FIX 1: checklist status values in demo seed ============
-- Replace invalid 'concluida' with allowed 'concluido' in admin_demo_seed_batch.
-- We recreate the function via a targeted textual replacement to avoid rewriting
-- the whole body. Use a DO block to CREATE OR REPLACE with substituted source.
DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE proname = 'admin_demo_seed_batch' AND pronamespace = 'public'::regnamespace;
  IF v_src IS NULL THEN RAISE EXCEPTION 'admin_demo_seed_batch not found'; END IF;
  v_src := replace(v_src, '''concluida''', '''concluido''');
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION public.admin_demo_seed_batch(_label text, _personas jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS %L
  $f$, v_src);
END
$mig$;

-- ============ FIX 2: RLS recursion between collaborators <-> client_collaborators ============
-- Cycle:
--   policy "Collab: client of same company read" (collaborators)
--     -> subquery on client_collaborators
--       -> policy "CC: self read" (client_collaborators)
--         -> subquery on collaborators + clients
--           -> policy on collaborators fires again  = infinite recursion.
--
-- Fix: replace the cross-table EXISTS in these two SELECT policies with
-- SECURITY DEFINER helper functions that read the tables directly (RLS bypassed).

-- Helper 1: does _user_id own the collaborator row _collab_id (and it's active)?
CREATE OR REPLACE FUNCTION public.user_owns_collaborator(_user_id uuid, _collab_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.collaborators
     WHERE id = _collab_id
       AND user_id = _user_id
       AND COALESCE(status, 'active') = 'active'
  )
$$;

-- Helper 2: is collaborator _collab_id linked to any client that _user_id can access?
-- Reuses user_has_client_access (already SECURITY DEFINER, non-recursive on this path
-- because it reads clients / client_users / client_collaborators / collaborators
-- as the definer, which bypasses RLS entirely).
CREATE OR REPLACE FUNCTION public.collaborator_visible_to_user(_user_id uuid, _collab_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.client_collaborators cc
      JOIN public.clients cl ON cl.id = cc.client_id
     WHERE cc.collaborator_id = _collab_id
       AND cl.deleted_at IS NULL
       AND COALESCE(cl.status, 'active') <> 'inactive'
       AND public.user_has_client_access(_user_id, cc.client_id)
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_collaborator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collaborator_visible_to_user(uuid, uuid) TO authenticated;

-- Rewrite the two offending policies.
DROP POLICY IF EXISTS "CC: self read" ON public.client_collaborators;
CREATE POLICY "CC: self read"
  ON public.client_collaborators
  FOR SELECT
  USING (public.user_owns_collaborator(auth.uid(), collaborator_id));

DROP POLICY IF EXISTS "Collab: client of same company read" ON public.collaborators;
CREATE POLICY "Collab: client of same company read"
  ON public.collaborators
  FOR SELECT
  USING (public.collaborator_visible_to_user(auth.uid(), id));
