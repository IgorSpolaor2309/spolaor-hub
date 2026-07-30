
CREATE OR REPLACE FUNCTION public.admin_list_client_collaborator_options(p_client_id uuid DEFAULT NULL)
RETURNS TABLE(
  collaborator_id uuid,
  nome text,
  email text,
  status text,
  linked boolean,
  is_primary boolean,
  eligible_primary boolean,
  ineligible_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_demo boolean := false;
  v_batch uuid := NULL;
  v_found boolean := false;
BEGIN
  IF NOT public._competence_admin_or_service() THEN
    RAISE EXCEPTION 'Apenas administradores podem consultar a carteira de colaboradores.' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT COALESCE(c.is_demo,false), c.demo_batch_id, true
      INTO v_is_demo, v_batch, v_found
      FROM public.clients c WHERE c.id = p_client_id;
    IF NOT v_found THEN
      RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    col.id,
    col.nome,
    col.email,
    COALESCE(col.status,'active'),
    (cc.collaborator_id IS NOT NULL),
    COALESCE(cc.is_primary, false),
    (COALESCE(col.status,'active') = 'active'
       AND p.id IS NOT NULL
       AND COALESCE(p.status,'active') = 'active'
       AND has_staff.ok),
    CASE
      WHEN COALESCE(col.status,'active') <> 'active' THEN 'Colaborador inativo'
      WHEN p.id IS NULL THEN 'Sem conta de acesso'
      WHEN COALESCE(p.status,'active') <> 'active' THEN 'Conta de acesso inativa'
      WHEN NOT has_staff.ok THEN 'Conta sem perfil da equipe'
      ELSE NULL
    END
  FROM public.collaborators col
  LEFT JOIN public.client_collaborators cc
         ON cc.collaborator_id = col.id AND cc.client_id = p_client_id
  LEFT JOIN public.profiles p
         ON p.id = col.user_id
        AND COALESCE(p.is_demo,false) = v_is_demo
        AND (NOT v_is_demo OR v_batch IS NOT DISTINCT FROM p.demo_batch_id)
  CROSS JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = p.id AND ur.role IN ('admin','collaborator')
    ) AS ok
  ) has_staff
  WHERE COALESCE(col.is_demo,false) = v_is_demo
    AND (COALESCE(col.status,'active') = 'active' OR cc.collaborator_id IS NOT NULL)
  ORDER BY col.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_client_collaborator_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_client_collaborator_options(uuid) TO authenticated, service_role;
