
-- Rewrite admin_demo_wipe: complete, ordered, transactional cleanup of all demo rows.
-- Adds admin_demo_wipe_preview to summarize what will be deleted per table.

CREATE OR REPLACE FUNCTION public.admin_demo_wipe_preview(_batch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
  t text;
  tables text[] := ARRAY[
    'timeline_events','notifications','tax_guides','document_requests',
    'client_checklist_items','documents','company_process_steps','company_processes',
    'process_steps','process_types','plan_items','plans',
    'collaborators','clients','profiles'
  ];
  where_clause text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I %s', t, where_clause) INTO v_n;
    v_counts := v_counts || jsonb_build_object(t, v_n);
  END LOOP;

  RETURN v_counts;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_demo_wipe_preview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_demo_wipe(_batch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted bigint;
  t text;
  -- Delete order: leaves first, respecting FK RESTRICT (company_processes -> process_types).
  -- Auxiliary child tables (client_*, company_process_documents, *_step_requirements,
  -- chat_*, interactions, pending_tasks, etc.) cascade automatically from clients /
  -- collaborators / documents / process_steps / company_process_steps / plans / profiles.
  tables text[] := ARRAY[
    'timeline_events','notifications','tax_guides','document_requests',
    'client_checklist_items','documents','company_process_steps','company_processes',
    'process_steps','process_types','plan_items','plans',
    'collaborators','clients','profiles'
  ];
  where_clause text;
  v_contamination jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;

  -- Safety: refuse to run if a REAL row (is_demo=false) targets a DEMO parent.
  -- If a contamination is detected, abort so the admin can review manually.
  PERFORM 1
  FROM public.company_processes cp
  JOIN public.process_types pt ON pt.id = cp.process_type_id
  WHERE pt.is_demo = true AND coalesce(cp.is_demo, false) = false
    AND (_batch_id IS NULL OR pt.demo_batch_id = _batch_id);
  IF FOUND THEN
    RAISE EXCEPTION 'Contaminação detectada: processos reais vinculados a tipo de processo demo. Limpeza abortada.';
  END IF;

  PERFORM 1
  FROM public.client_checklist_items cci
  JOIN public.clients c ON c.id = cci.client_id
  WHERE c.is_demo = true AND coalesce(cci.is_demo, false) = false
    AND (_batch_id IS NULL OR c.demo_batch_id = _batch_id);
  IF FOUND THEN
    RAISE EXCEPTION 'Contaminação detectada: itens de checklist reais em empresa demo. Limpeza abortada.';
  END IF;

  -- Perform deletions in order. All within the caller's transaction — any error rolls back.
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DELETE FROM public.%I %s', t, where_clause);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object(t, v_deleted);
  END LOOP;

  -- Mark batch(es) wiped ONLY after all deletions succeeded.
  IF _batch_id IS NOT NULL THEN
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE id = _batch_id;
  ELSE
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE status = 'active';
  END IF;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'wipe', _batch_id, jsonb_build_object('deleted', v_counts));

  RETURN v_counts;
END $$;
