-- ===========================================================
-- Fase 4: automação e gestão administrativa das competências
-- ===========================================================

-- 1) Tabela de auditoria das execuções ---------------------------------
CREATE TABLE IF NOT EXISTS public.competence_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competence text NOT NULL,
  source text NOT NULL CHECK (source IN ('manual','cron')),
  executor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  include_demo boolean NOT NULL DEFAULT false,
  analyzed int NOT NULL DEFAULT 0,
  created int NOT NULL DEFAULT 0,
  existed int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  missing_responsible int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms int
);

GRANT SELECT ON public.competence_generation_runs TO authenticated;
GRANT ALL    ON public.competence_generation_runs TO service_role;
ALTER TABLE public.competence_generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read runs" ON public.competence_generation_runs;
CREATE POLICY "admins read runs" ON public.competence_generation_runs
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Gravação apenas via SECURITY DEFINER: nenhuma policy para INSERT/UPDATE/DELETE.

CREATE INDEX IF NOT EXISTS competence_generation_runs_comp_idx
  ON public.competence_generation_runs (competence, started_at DESC);

-- 2) Autorização: admin OU service_role ---------------------------------
CREATE OR REPLACE FUNCTION public._competence_admin_or_service()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_admin(auth.uid()), false)
      OR COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role', false);
$$;

REVOKE ALL ON FUNCTION public._competence_admin_or_service() FROM public, anon;
GRANT EXECUTE ON FUNCTION public._competence_admin_or_service() TO authenticated, service_role;

-- 3) Preview: empresas elegíveis para uma competência -------------------
CREATE OR REPLACE FUNCTION public.admin_generate_monthly_competences_preview(
  p_competence text,
  p_include_demo boolean DEFAULT false
)
RETURNS TABLE (
  client_id uuid,
  razao_social text,
  is_demo boolean,
  situacao text,               -- 'nova' | 'ja_existe' | 'inativa' | 'sem_responsavel' | 'pre_entrada' | 'excluida'
  responsible_profile_id uuid,
  responsible_name text
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date;
BEGIN
  IF NOT public._competence_admin_or_service() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid competence format' USING ERRCODE = '22023';
  END IF;
  v_month_start := (p_competence || '-01')::date;

  RETURN QUERY
  WITH candidates AS (
    SELECT c.id, c.razao_social, c.is_demo, c.status, c.deleted_at,
           c.data_entrada, c.owner_profile_id
      FROM public.clients c
     WHERE (p_include_demo OR NOT COALESCE(c.is_demo, false))
       AND (NOT p_include_demo = false OR true) -- sempre true; mantido por clareza
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
        WHEN ca.owner_profile_id IS NULL                              THEN 'sem_responsavel'
        WHEN NOT EXISTS (SELECT 1 FROM public.profiles pr
                          WHERE pr.id = ca.owner_profile_id
                            AND COALESCE(pr.status,'active') = 'active'
                            AND COALESCE(pr.is_demo,false) = COALESCE(ca.is_demo,false)) THEN 'sem_responsavel'
        ELSE 'nova'
      END AS situacao
    FROM candidates ca
  )
  SELECT ev.id, ev.razao_social, COALESCE(ev.is_demo,false),
         ev.situacao,
         CASE WHEN ev.situacao IN ('nova','sem_responsavel') THEN ev.owner_profile_id END,
         (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = ev.owner_profile_id)
    FROM ev
   ORDER BY ev.razao_social;
END $$;

REVOKE ALL ON FUNCTION public.admin_generate_monthly_competences_preview(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_monthly_competences_preview(text, boolean)
  TO authenticated, service_role;

-- 4) Execução da geração ------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_generate_monthly_competences(
  p_competence text,
  p_include_demo boolean DEFAULT false,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run_id uuid := gen_random_uuid();
  v_started timestamptz := clock_timestamp();
  v_analyzed int := 0;
  v_created  int := 0;
  v_existed  int := 0;
  v_skipped  int := 0;
  v_missing  int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_ids uuid[] := ARRAY[]::uuid[];
  r record;
  v_resp uuid;
  v_row public.client_competences;
BEGIN
  IF NOT public._competence_admin_or_service() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_source NOT IN ('manual','cron') THEN
    RAISE EXCEPTION 'invalid source' USING ERRCODE = '22023';
  END IF;

  -- Início da execução (auditoria)
  INSERT INTO public.competence_generation_runs
    (id, competence, source, executor_profile_id, include_demo, started_at)
  VALUES
    (v_run_id, p_competence, p_source, v_uid, COALESCE(p_include_demo,false), v_started);

  FOR r IN
    SELECT * FROM public.admin_generate_monthly_competences_preview(p_competence, COALESCE(p_include_demo,false))
  LOOP
    v_analyzed := v_analyzed + 1;

    IF r.situacao = 'ja_existe' THEN
      v_existed := v_existed + 1;
      CONTINUE;
    ELSIF r.situacao IN ('inativa','pre_entrada','excluida') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_resp := r.responsible_profile_id; -- pode ser NULL se situacao='sem_responsavel'
    IF v_resp IS NULL THEN
      v_missing := v_missing + 1;
    END IF;

    BEGIN
      INSERT INTO public.client_competences
        (client_id, competence, status, responsible_profile_id,
         is_demo, demo_batch_id, created_by)
      SELECT r.client_id, p_competence, 'open', v_resp,
             COALESCE(c.is_demo,false), c.demo_batch_id, v_uid
        FROM public.clients c
       WHERE c.id = r.client_id
      ON CONFLICT (client_id, competence) DO NOTHING
      RETURNING * INTO v_row;

      IF v_row.id IS NULL THEN
        -- Corrida: alguém criou entre preview e insert.
        v_existed := v_existed + 1;
        IF v_resp IS NULL THEN v_missing := v_missing - 1; END IF;
        CONTINUE;
      END IF;

      v_created := v_created + 1;
      v_ids := array_append(v_ids, v_row.id);

      -- Timeline (respeita demo do cliente)
      INSERT INTO public.timeline_events
        (client_id, actor_profile_id, tipo, descricao, metadata, is_demo, demo_batch_id)
      VALUES
        (r.client_id, v_uid, 'competencia_iniciada',
         format('Competência %s iniciada', p_competence),
         jsonb_build_object('competence', p_competence,
                            'competence_id', v_row.id,
                            'source', p_source,
                            'automated', true),
         v_row.is_demo, v_row.demo_batch_id);

      -- Notificação individual ao responsável (respeita is_demo do perfil via notify_user)
      IF v_resp IS NOT NULL THEN
        PERFORM public.notify_user(
          v_resp,
          'competencia_atribuida',
          format('Competência %s atribuída', p_competence),
          'Uma nova competência foi atribuída a você.',
          format('/competencias/%s/%s', r.client_id, p_competence)
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'client_id', r.client_id,
        'razao_social', r.razao_social,
        'stage', 'insert_or_notify',
        'message', 'Falha ao preparar competência para esta empresa.'
      );
      IF v_resp IS NULL AND v_row.id IS NULL THEN v_missing := v_missing - 1; END IF;
    END;
  END LOOP;

  UPDATE public.competence_generation_runs
     SET analyzed = v_analyzed,
         created  = v_created,
         existed  = v_existed,
         skipped  = v_skipped,
         missing_responsible = v_missing,
         errors   = v_errors,
         created_ids = v_ids,
         finished_at = clock_timestamp(),
         duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int
   WHERE id = v_run_id;

  -- Resumo para o administrador (uma única notificação por execução)
  IF v_uid IS NOT NULL AND (v_missing > 0 OR jsonb_array_length(v_errors) > 0 OR v_skipped > 0) THEN
    PERFORM public.notify_user(
      v_uid,
      'competencia_geracao_resumo',
      format('Preparação de %s concluída', p_competence),
      format('Criadas: %s · Já existiam: %s · Sem responsável: %s · Ignoradas: %s · Erros: %s',
             v_created, v_existed, v_missing, v_skipped, jsonb_array_length(v_errors)),
      '/competencias'
    );
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'competence', p_competence,
    'source', p_source,
    'include_demo', COALESCE(p_include_demo,false),
    'analyzed', v_analyzed,
    'created',  v_created,
    'existed',  v_existed,
    'skipped',  v_skipped,
    'missing_responsible', v_missing,
    'errors',   v_errors,
    'created_ids', to_jsonb(v_ids),
    'duration_ms', (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_generate_monthly_competences(text, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_monthly_competences(text, boolean, text)
  TO authenticated, service_role;

-- 5) Ações em lote seguras ---------------------------------------------

-- 5a) Iniciar (open → in_progress) várias competências
CREATE OR REPLACE FUNCTION public.admin_bulk_competence_start(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok int := 0;
  v_skip int := 0;
  v_err int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_id uuid;
  v_row public.client_competences;
BEGIN
  IF NOT COALESCE(public.is_admin(v_uid), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      UPDATE public.client_competences
         SET status = 'in_progress'
       WHERE id = v_id AND status = 'open'
      RETURNING * INTO v_row;

      IF v_row.id IS NULL THEN
        v_skip := v_skip + 1;
      ELSE
        v_ok := v_ok + 1;
        INSERT INTO public.timeline_events
          (client_id, actor_profile_id, tipo, descricao, metadata, is_demo, demo_batch_id)
        VALUES
          (v_row.client_id, v_uid, 'competencia_status',
           format('Competência %s em andamento', v_row.competence),
           jsonb_build_object('competence_id', v_row.id, 'status','in_progress','bulk',true),
           v_row.is_demo, v_row.demo_batch_id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('id', v_id, 'message', 'Falha na transição.');
    END;
  END LOOP;

  RETURN jsonb_build_object('updated', v_ok, 'skipped', v_skip, 'errors', v_err, 'error_items', v_errors);
END $$;

REVOKE ALL ON FUNCTION public.admin_bulk_competence_start(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_competence_start(uuid[]) TO authenticated;

-- 5b) Atribuir responsável em lote
CREATE OR REPLACE FUNCTION public.admin_bulk_assign_responsible(
  p_ids uuid[],
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok int := 0;
  v_err int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_id uuid;
  v_row public.client_competences;
  v_prof record;
BEGIN
  IF NOT COALESCE(public.is_admin(v_uid), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile required';
  END IF;

  SELECT id, status, is_demo, demo_batch_id
    INTO v_prof FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF COALESCE(v_prof.status,'active') <> 'active' THEN
    RAISE EXCEPTION 'profile inactive';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      SELECT * INTO v_row FROM public.client_competences WHERE id = v_id;
      IF v_row.id IS NULL THEN
        v_err := v_err + 1;
        v_errors := v_errors || jsonb_build_object('id', v_id, 'message', 'Competência não encontrada.');
        CONTINUE;
      END IF;
      -- Coerência demo/real
      IF COALESCE(v_row.is_demo,false) <> COALESCE(v_prof.is_demo,false)
         OR (v_row.is_demo AND v_row.demo_batch_id IS DISTINCT FROM v_prof.demo_batch_id) THEN
        v_err := v_err + 1;
        v_errors := v_errors || jsonb_build_object('id', v_id, 'message', 'Responsável incompatível com o ambiente (real/demo).');
        CONTINUE;
      END IF;

      UPDATE public.client_competences
         SET responsible_profile_id = p_profile_id
       WHERE id = v_id;

      v_ok := v_ok + 1;
      INSERT INTO public.timeline_events
        (client_id, actor_profile_id, tipo, descricao, metadata, is_demo, demo_batch_id)
      VALUES
        (v_row.client_id, v_uid, 'competencia_responsavel',
         format('Responsável alterado para %s', v_row.competence),
         jsonb_build_object('competence_id', v_row.id, 'responsible', p_profile_id, 'bulk', true),
         v_row.is_demo, v_row.demo_batch_id);

      -- Notificação única por competência atribuída (dedup: mesmo user_id + link)
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
         WHERE n.user_id = p_profile_id
           AND n.tipo   = 'competencia_atribuida'
           AND n.link   = format('/competencias/%s/%s', v_row.client_id, v_row.competence)
      ) THEN
        PERFORM public.notify_user(
          p_profile_id,
          'competencia_atribuida',
          format('Competência %s atribuída', v_row.competence),
          'Uma competência foi atribuída a você.',
          format('/competencias/%s/%s', v_row.client_id, v_row.competence)
        );
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_err := v_err + 1;
      v_errors := v_errors || jsonb_build_object('id', v_id, 'message', 'Falha na atribuição.');
    END;
  END LOOP;

  RETURN jsonb_build_object('updated', v_ok, 'errors', v_err, 'error_items', v_errors);
END $$;

REVOKE ALL ON FUNCTION public.admin_bulk_assign_responsible(uuid[], uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_assign_responsible(uuid[], uuid) TO authenticated;
