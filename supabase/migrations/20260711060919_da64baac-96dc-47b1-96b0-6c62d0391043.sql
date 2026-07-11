
-- 1) open_company_process with demo propagation ----------------------------------
CREATE OR REPLACE FUNCTION public.open_company_process(
  _client_id uuid,
  _process_type_id uuid,
  _responsavel_id uuid DEFAULT NULL,
  _prazo_final date DEFAULT NULL,
  _prioridade text DEFAULT 'media',
  _observacoes text DEFAULT NULL,
  _is_demo boolean DEFAULT false,
  _demo_batch_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.company_processes
    (client_id, process_type_id, responsavel_id, prazo_final, prioridade, observacoes, created_by,
     is_demo, demo_batch_id)
  VALUES
    (_client_id, _process_type_id, _responsavel_id, _prazo_final,
     COALESCE(_prioridade,'media'), _observacoes, auth.uid(),
     COALESCE(_is_demo, false), _demo_batch_id)
  RETURNING id INTO _new_id;

  WITH inserted_steps AS (
    INSERT INTO public.company_process_steps (
      company_process_id, process_step_id, nome, descricao, ordem, departamento,
      obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
      responsavel_id, prazo, prazo_tipo, prazo_dias,
      nome_publico, descricao_publica, observacao_publica,
      is_demo, demo_batch_id
    )
    SELECT _new_id, s.id, s.nome, s.descricao, s.ordem, s.departamento,
           s.obrigatoria, s.exige_documento, COALESCE(s.visivel_cliente,false), s.pode_concluir_manual,
           COALESCE(_responsavel_id, s.responsavel_padrao_id),
           CASE WHEN s.prazo_tipo='abertura' AND s.prazo_dias IS NOT NULL
                THEN (_hoje + (s.prazo_dias||' days')::interval)::date ELSE NULL END,
           s.prazo_tipo, s.prazo_dias,
           s.nome_publico, s.descricao_publica, s.observacao_publica,
           COALESCE(_is_demo, false), _demo_batch_id
      FROM public.process_steps s
     WHERE s.process_type_id = _process_type_id
     ORDER BY s.ordem, s.created_at
    RETURNING id, process_step_id
  )
  INSERT INTO public.company_process_step_requirements
    (company_process_step_id, source_requirement_id, label, descricao, obrigatorio,
     tipos_permitidos, tamanho_max_mb)
  SELECT ins.id, r.id, r.label, r.descricao, r.obrigatorio,
         r.tipos_permitidos, r.tamanho_max_mb
    FROM inserted_steps ins
    JOIN public.process_step_requirements r ON r.process_step_id = ins.process_step_id;

  RETURN _new_id;
END $function$;

-- 2) Repair currently contaminated rows (process first, then steps) ---------------
UPDATE public.company_processes cp
   SET is_demo = true, demo_batch_id = pt.demo_batch_id
  FROM public.process_types pt, public.clients c
 WHERE cp.process_type_id = pt.id
   AND cp.client_id = c.id
   AND pt.is_demo = true AND c.is_demo = true
   AND (COALESCE(cp.is_demo,false) = false OR cp.demo_batch_id IS DISTINCT FROM pt.demo_batch_id);

UPDATE public.company_process_steps cps
   SET is_demo = cp.is_demo, demo_batch_id = cp.demo_batch_id
  FROM public.company_processes cp
 WHERE cps.company_process_id = cp.id
   AND cp.is_demo = true
   AND (COALESCE(cps.is_demo,false) <> true OR cps.demo_batch_id IS DISTINCT FROM cp.demo_batch_id);

-- 3) Trigger: enforce demo consistency on company_processes -----------------------
CREATE OR REPLACE FUNCTION public.enforce_company_process_demo_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type_is_demo boolean;
  v_type_batch uuid;
  v_client_is_demo boolean;
BEGIN
  SELECT is_demo, demo_batch_id INTO v_type_is_demo, v_type_batch
    FROM public.process_types WHERE id = NEW.process_type_id;
  SELECT is_demo INTO v_client_is_demo
    FROM public.clients WHERE id = NEW.client_id;

  IF v_type_is_demo = true THEN
    IF COALESCE(v_client_is_demo, false) = false THEN
      RAISE EXCEPTION 'demo_process_type_requires_demo_client';
    END IF;
    IF COALESCE(NEW.is_demo, false) = false THEN
      RAISE EXCEPTION 'demo_process_type_requires_demo_flag';
    END IF;
    IF NEW.demo_batch_id IS DISTINCT FROM v_type_batch THEN
      RAISE EXCEPTION 'demo_batch_mismatch_with_process_type';
    END IF;
  ELSE
    IF COALESCE(NEW.is_demo, false) = true THEN
      RAISE EXCEPTION 'real_process_type_cannot_be_demo';
    END IF;
    IF NEW.demo_batch_id IS NOT NULL THEN
      RAISE EXCEPTION 'real_process_must_not_have_demo_batch';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_company_process_demo_consistency ON public.company_processes;
CREATE TRIGGER trg_company_process_demo_consistency
  BEFORE INSERT OR UPDATE ON public.company_processes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_process_demo_consistency();

-- 4) Patch admin_demo_create_environment to pass demo flags directly --------------
DO $do$
DECLARE src text; new_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src
    FROM pg_proc WHERE proname='admin_demo_create_environment';
  new_src := replace(
    src,
    'v_proc1 := public.open_company_process(v_client_comercio, v_ptype_abertura, NULL, NULL, ''media'', ''[DEMO] Processo de demonstração'');',
    'v_proc1 := public.open_company_process(v_client_comercio, v_ptype_abertura, NULL, NULL, ''media'', ''[DEMO] Processo de demonstração'', true, v_batch);'
  );
  new_src := replace(
    new_src,
    'v_proc2 := public.open_company_process(v_client_servicos, v_ptype_alteracao, NULL, NULL, ''media'', ''[DEMO] Processo de demonstração'');',
    'v_proc2 := public.open_company_process(v_client_servicos, v_ptype_alteracao, NULL, NULL, ''media'', ''[DEMO] Processo de demonstração'', true, v_batch);'
  );
  new_src := regexp_replace(
    new_src,
    E'UPDATE public\\.company_processes\\s+SET is_demo = true, demo_batch_id = v_batch\\s+WHERE id IN \\(v_proc1, v_proc2\\);',
    '-- company_processes already tagged on insert',
    'g'
  );
  new_src := regexp_replace(
    new_src,
    E'UPDATE public\\.company_process_steps\\s+SET is_demo = true, demo_batch_id = v_batch\\s+WHERE company_process_id IN \\(v_proc1, v_proc2\\);',
    '-- company_process_steps already tagged on insert',
    'g'
  );
  EXECUTE new_src;
END $do$;

-- 5) Contamination report ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_demo_contamination_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_admin uuid := auth.uid(); v_result jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_result := jsonb_build_object(
    'real_processes_using_demo_type',
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'company_process_id', cp.id, 'client_id', cp.client_id, 'client_name', c.razao_social,
        'client_is_demo', c.is_demo, 'process_type_id', pt.id, 'process_type_name', pt.nome,
        'process_type_batch', pt.demo_batch_id, 'cp_is_demo', cp.is_demo,
        'cp_demo_batch_id', cp.demo_batch_id, 'created_at', cp.created_at, 'created_by', cp.created_by,
        'case', CASE WHEN c.is_demo THEN 'A' ELSE 'B' END))
        FROM public.company_processes cp
        JOIN public.process_types pt ON pt.id = cp.process_type_id
        LEFT JOIN public.clients c ON c.id = cp.client_id
        WHERE pt.is_demo = true AND COALESCE(cp.is_demo,false) = false), '[]'::jsonb),
    'demo_processes_using_real_type',
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'company_process_id', cp.id, 'process_type_id', pt.id, 'process_type_name', pt.nome))
        FROM public.company_processes cp
        JOIN public.process_types pt ON pt.id = cp.process_type_id
        WHERE cp.is_demo = true AND COALESCE(pt.is_demo,false) = false), '[]'::jsonb),
    'demo_batch_mismatch',
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'company_process_id', cp.id, 'cp_batch', cp.demo_batch_id, 'type_batch', pt.demo_batch_id))
        FROM public.company_processes cp
        JOIN public.process_types pt ON pt.id = cp.process_type_id
        WHERE cp.is_demo = true AND pt.is_demo = true
          AND cp.demo_batch_id IS DISTINCT FROM pt.demo_batch_id), '[]'::jsonb),
    'demo_without_batch',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('table', t, 'id', id))
        FROM (
          SELECT 'company_processes' AS t, id FROM public.company_processes WHERE is_demo=true AND demo_batch_id IS NULL
          UNION ALL SELECT 'process_types', id FROM public.process_types WHERE is_demo=true AND demo_batch_id IS NULL
          UNION ALL SELECT 'process_steps', id FROM public.process_steps WHERE is_demo=true AND demo_batch_id IS NULL
          UNION ALL SELECT 'clients', id FROM public.clients WHERE is_demo=true AND demo_batch_id IS NULL
        ) x), '[]'::jsonb),
    'steps_flag_diverges_from_process',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('step_id', cps.id, 'process_id', cp.id))
        FROM public.company_process_steps cps
        JOIN public.company_processes cp ON cp.id = cps.company_process_id
        WHERE COALESCE(cps.is_demo,false) <> COALESCE(cp.is_demo,false)
           OR cps.demo_batch_id IS DISTINCT FROM cp.demo_batch_id), '[]'::jsonb)
  );
  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_demo_contamination_report() TO authenticated;

-- 6) Caso A repair helper ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_demo_repair_case_a()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_p int := 0; v_s int := 0;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.company_processes cp
     SET is_demo = true, demo_batch_id = pt.demo_batch_id
    FROM public.process_types pt, public.clients c
   WHERE cp.process_type_id = pt.id AND cp.client_id = c.id
     AND pt.is_demo = true AND c.is_demo = true
     AND (COALESCE(cp.is_demo,false) = false OR cp.demo_batch_id IS DISTINCT FROM pt.demo_batch_id);
  GET DIAGNOSTICS v_p = ROW_COUNT;

  UPDATE public.company_process_steps cps
     SET is_demo = cp.is_demo, demo_batch_id = cp.demo_batch_id
    FROM public.company_processes cp
   WHERE cps.company_process_id = cp.id
     AND cp.is_demo = true
     AND (COALESCE(cps.is_demo,false) <> true OR cps.demo_batch_id IS DISTINCT FROM cp.demo_batch_id);
  GET DIAGNOSTICS v_s = ROW_COUNT;

  INSERT INTO public.demo_audit_log (admin_id, action, payload_json)
  VALUES (v_admin, 'repair_case_a',
          jsonb_build_object('processes', v_p, 'steps', v_s));

  RETURN jsonb_build_object('processes_fixed', v_p, 'steps_fixed', v_s);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_demo_repair_case_a() TO authenticated;
