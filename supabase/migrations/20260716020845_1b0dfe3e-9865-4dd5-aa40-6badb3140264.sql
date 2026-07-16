-- 1) Coluna scope na auditoria
ALTER TABLE public.competence_generation_runs
  ADD COLUMN IF NOT EXISTS scope text
    NOT NULL DEFAULT 'real'
    CHECK (scope IN ('real','demo','all'));

-- 2) Remover assinaturas antigas
DROP FUNCTION IF EXISTS public.admin_generate_monthly_competences_preview(text, boolean);
DROP FUNCTION IF EXISTS public.admin_generate_monthly_competences(text, boolean, text);

-- 3) Preview com escopo
CREATE OR REPLACE FUNCTION public.admin_generate_monthly_competences_preview(
  p_competence text,
  p_scope text DEFAULT 'real'
)
RETURNS TABLE (
  client_id uuid,
  razao_social text,
  is_demo boolean,
  situacao text,
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
  IF p_scope NOT IN ('real','demo','all') THEN
    RAISE EXCEPTION 'invalid scope' USING ERRCODE = '22023';
  END IF;
  v_month_start := (p_competence || '-01')::date;

  RETURN QUERY
  WITH candidates AS (
    SELECT c.id, c.razao_social, c.is_demo, c.status, c.deleted_at,
           c.data_entrada, c.owner_profile_id
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

REVOKE ALL ON FUNCTION public.admin_generate_monthly_competences_preview(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_monthly_competences_preview(text, text)
  TO authenticated, service_role;

-- 4) Execução com escopo
CREATE OR REPLACE FUNCTION public.admin_generate_monthly_competences(
  p_competence text,
  p_scope text DEFAULT 'real',
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
  IF p_scope NOT IN ('real','demo','all') THEN
    RAISE EXCEPTION 'invalid scope' USING ERRCODE = '22023';
  END IF;
  IF p_source = 'cron' AND p_scope <> 'real' THEN
    RAISE EXCEPTION 'cron scope must be real' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.competence_generation_runs
    (id, competence, source, executor_profile_id, include_demo, scope, started_at)
  VALUES
    (v_run_id, p_competence, p_source, v_uid,
     (p_scope IN ('demo','all')), p_scope, v_started);

  FOR r IN
    SELECT * FROM public.admin_generate_monthly_competences_preview(p_competence, p_scope)
  LOOP
    v_analyzed := v_analyzed + 1;

    IF r.situacao = 'ja_existe' THEN
      v_existed := v_existed + 1;
      CONTINUE;
    ELSIF r.situacao IN ('inativa','pre_entrada','excluida') THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_resp := r.responsible_profile_id;
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
        v_existed := v_existed + 1;
        IF v_resp IS NULL THEN v_missing := v_missing - 1; END IF;
        CONTINUE;
      END IF;

      v_created := v_created + 1;
      v_ids := array_append(v_ids, v_row.id);

      INSERT INTO public.timeline_events
        (client_id, actor_profile_id, tipo, descricao, metadata, is_demo, demo_batch_id)
      VALUES
        (r.client_id, v_uid, 'competencia_iniciada',
         format('Competência %s iniciada', p_competence),
         jsonb_build_object('competence', p_competence,
                            'competence_id', v_row.id,
                            'source', p_source,
                            'scope', p_scope,
                            'automated', true),
         v_row.is_demo, v_row.demo_batch_id);

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
    'scope', p_scope,
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

REVOKE ALL ON FUNCTION public.admin_generate_monthly_competences(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_monthly_competences(text, text, text)
  TO authenticated, service_role;

-- 5) admin_demo_seed_batch: definir owner_profile_id dos clientes demo 1 e 2.
DO $mig$
DECLARE
  v_src text;
  v_old text := '  -- Vínculos colaborador↔cliente (client3 fica SEM colaborador propositalmente)';
  v_new text := '  -- Responsáveis das empresas demo (owner_profile_id)' || E'\n' ||
                '  UPDATE public.clients SET owner_profile_id = v_collab1 WHERE id = v_client1;' || E'\n' ||
                '  UPDATE public.clients SET owner_profile_id = v_collab2 WHERE id = v_client2;' || E'\n\n' ||
                '  -- Vínculos colaborador↔cliente (client3 fica SEM colaborador propositalmente)';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'admin_demo_seed_batch';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'admin_demo_seed_batch not found';
  END IF;
  IF position('owner_profile_id = v_collab1' IN v_src) > 0 THEN
    -- já aplicado; nada a fazer
    RETURN;
  END IF;
  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'anchor comment not found in admin_demo_seed_batch';
  END IF;

  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.admin_demo_seed_batch(_label text, _personas jsonb)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
     AS %L',
    v_src
  );
END
$mig$;