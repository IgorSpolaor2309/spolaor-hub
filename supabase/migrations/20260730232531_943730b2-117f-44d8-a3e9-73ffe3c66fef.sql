-- 1) Marcador de responsável principal
ALTER TABLE public.client_collaborators
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS client_collaborators_one_primary
  ON public.client_collaborators (client_id)
  WHERE is_primary;

-- 2) Backfill: único colaborador interno ativo vinculado vira principal
WITH staff_links AS (
  SELECT cc.id, cc.client_id
    FROM public.client_collaborators cc
    JOIN public.collaborators col ON col.id = cc.collaborator_id
    JOIN public.profiles p ON p.id = col.user_id
   WHERE COALESCE(col.status,'active') = 'active'
     AND COALESCE(p.status,'active') = 'active'
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role IN ('admin','collaborator'))
), singles AS (
  SELECT client_id FROM staff_links GROUP BY client_id HAVING count(*) = 1
)
UPDATE public.client_collaborators cc
   SET is_primary = true
  FROM staff_links sl
  JOIN singles s ON s.client_id = sl.client_id
 WHERE cc.id = sl.id
   AND NOT EXISTS (
     SELECT 1 FROM public.client_collaborators x
      WHERE x.client_id = cc.client_id AND x.is_primary
   );

-- 3) Fonte canônica do responsável interno
CREATE OR REPLACE FUNCTION public.resolve_client_internal_responsible(p_client_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id
    FROM public.client_collaborators cc
    JOIN public.collaborators col ON col.id = cc.collaborator_id
    JOIN public.profiles p ON p.id = col.user_id
    JOIN public.clients c ON c.id = cc.client_id
   WHERE cc.client_id = p_client_id
     AND COALESCE(col.status,'active') = 'active'
     AND COALESCE(p.status,'active') = 'active'
     AND COALESCE(p.is_demo,false) = COALESCE(c.is_demo,false)
     AND (NOT COALESCE(c.is_demo,false) OR c.demo_batch_id IS NOT DISTINCT FROM p.demo_batch_id)
     AND EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = p.id AND ur.role IN ('admin','collaborator'))
   ORDER BY cc.is_primary DESC, cc.created_at ASC
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_client_internal_responsible(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_client_internal_responsible(uuid) TO authenticated, service_role;

-- 4) Prévia mensal usa a fonte canônica
CREATE OR REPLACE FUNCTION public.admin_generate_monthly_competences_preview(p_competence text, p_scope text DEFAULT 'real'::text)
RETURNS TABLE(client_id uuid, razao_social text, is_demo boolean, situacao text, responsible_profile_id uuid, responsible_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month_start date;
BEGIN
  IF NOT public._competence_admin_or_service() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid competence format' USING ERRCODE = '22023';
  END IF;
  IF p_scope NOT IN ('real','demo','all') THEN
    RAISE EXCEPTION 'invalid scope' USING ERRCODE = '22023';
  END IF;
  v_month_start := (p_competence || '-01')::date;

  RETURN QUERY
  WITH candidates AS (
    SELECT c.id, c.razao_social, c.is_demo, c.status, c.deleted_at, c.data_entrada,
           public.resolve_client_internal_responsible(c.id) AS resp_id
      FROM public.clients c
     WHERE
       CASE p_scope
         WHEN 'real' THEN NOT COALESCE(c.is_demo,false)
         WHEN 'demo' THEN COALESCE(c.is_demo,false)
                      AND c.demo_batch_id IN (
                            SELECT db.id FROM public.demo_batches db WHERE db.status = 'active'
                          )
         WHEN 'all'  THEN true
       END
  ),
  ev AS (
    SELECT ca.*,
      CASE
        WHEN ca.deleted_at IS NOT NULL                                THEN 'excluida'
        WHEN COALESCE(ca.status,'active') <> 'active'                 THEN 'inativa'
        WHEN ca.data_entrada IS NOT NULL AND ca.data_entrada
             > (v_month_start + interval '1 month' - interval '1 day')::date THEN 'pre_entrada'
        WHEN EXISTS (SELECT 1 FROM public.client_competences cc
                      WHERE cc.client_id = ca.id
                        AND cc.competence = p_competence)             THEN 'ja_existe'
        WHEN ca.resp_id IS NULL                                       THEN 'sem_responsavel'
        ELSE 'nova'
      END AS situacao
    FROM candidates ca
  )
  SELECT ev.id, ev.razao_social, COALESCE(ev.is_demo,false),
         ev.situacao,
         CASE WHEN ev.situacao IN ('nova','sem_responsavel') THEN ev.resp_id END,
         (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = ev.resp_id)
    FROM ev
   ORDER BY ev.razao_social;
END $function$;

-- 5) Validação: responsável precisa ser da equipe e vinculado
CREATE OR REPLACE FUNCTION public._competence_validate_responsible(p_client_id uuid, p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client record; v_prof record; v_linked boolean;
BEGIN
  IF p_profile_id IS NULL THEN RETURN; END IF;

  SELECT id, is_demo, demo_batch_id, status
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

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = p_profile_id AND ur.role IN ('admin','collaborator')
  ) THEN
    RAISE EXCEPTION 'responsible must be an internal staff user';
  END IF;

  SELECT
    public.is_admin(p_profile_id)
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