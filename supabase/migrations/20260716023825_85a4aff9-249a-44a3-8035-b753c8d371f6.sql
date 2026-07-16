CREATE OR REPLACE FUNCTION public._competence_validate_responsible(p_client_id uuid, p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client record; v_prof record; v_linked boolean;
BEGIN
  IF p_profile_id IS NULL THEN RETURN; END IF;

  SELECT id, is_demo, demo_batch_id, owner_profile_id, status
    INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'client not found'; END IF;

  SELECT id, is_demo, demo_batch_id, status FROM public.profiles
    WHERE id = p_profile_id INTO v_prof;
  IF NOT FOUND THEN RAISE EXCEPTION 'responsible profile not found'; END IF;

  IF coalesce(v_prof.status,'active') <> 'active' THEN
    RAISE EXCEPTION 'responsible profile is not active';
  END IF;

  IF coalesce(v_client.is_demo,false) <> coalesce(v_prof.is_demo,false) THEN
    RAISE EXCEPTION 'demo/real mismatch between client and responsible';
  END IF;
  IF v_client.is_demo AND v_client.demo_batch_id IS DISTINCT FROM v_prof.demo_batch_id THEN
    RAISE EXCEPTION 'responsible belongs to a different demo batch';
  END IF;

  -- Vínculo: admin, owner do cliente ou colaborador vinculado
  -- (client_collaborators.collaborator_id -> collaborators.id -> collaborators.user_id = profile_id)
  SELECT
    public.is_admin(p_profile_id)
    OR v_client.owner_profile_id = p_profile_id
    OR EXISTS (
      SELECT 1
        FROM public.client_collaborators cc
        JOIN public.collaborators c ON c.id = cc.collaborator_id
       WHERE cc.client_id = p_client_id
         AND c.user_id    = p_profile_id
         AND coalesce(c.status,'active') = 'active'
    )
  INTO v_linked;

  IF NOT v_linked THEN
    RAISE EXCEPTION 'responsible has no link with client';
  END IF;
END $function$;