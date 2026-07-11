
CREATE OR REPLACE FUNCTION public.admin_demo_validate_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_status text;
  v_overall text := 'pass';
  v_batch record;

  v_profiles_count int;
  v_admin_count int;
  v_collab_count int;
  v_client_count int;
  v_clients_count int;
  v_active_collab_links int;
  v_client_user_links int;
  v_processes_count int;
  v_steps_count int;
  v_checklist_count int;
  v_guides_count int;
  v_notifications_count int;
  v_timeline_count int;
  v_docs_count int;

  v_orphan_profiles int;
  v_bad_status_collab int;
  v_real_leak int;
  v_missing_batch int;

  add_check text := '';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'batch_id_required';
  END IF;

  SELECT * INTO v_batch FROM public.demo_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'batch_not_found';
  END IF;

  -- Counts scoped to this batch
  SELECT count(*) INTO v_profiles_count FROM public.profiles
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_admin_count FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.is_demo = true AND p.demo_batch_id = p_batch_id AND ur.role = 'admin';

  SELECT count(*) INTO v_collab_count FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.is_demo = true AND p.demo_batch_id = p_batch_id AND ur.role = 'collaborator';

  SELECT count(*) INTO v_client_count FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE p.is_demo = true AND p.demo_batch_id = p_batch_id AND ur.role = 'client';

  SELECT count(*) INTO v_clients_count FROM public.clients
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_active_collab_links FROM public.collaborators
    WHERE is_demo = true AND demo_batch_id = p_batch_id AND status = 'active';

  SELECT count(*) INTO v_bad_status_collab FROM public.collaborators
    WHERE is_demo = true AND demo_batch_id = p_batch_id AND status <> 'active';

  SELECT count(*) INTO v_client_user_links FROM public.client_users
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_processes_count FROM public.company_processes
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_steps_count FROM public.company_process_steps
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_checklist_count FROM public.client_checklist_items
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_guides_count FROM public.tax_guides
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_notifications_count FROM public.notifications
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_timeline_count FROM public.timeline_events
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  SELECT count(*) INTO v_docs_count FROM public.documents
    WHERE is_demo = true AND demo_batch_id = p_batch_id;

  -- Contamination checks (must be 0)
  SELECT count(*) INTO v_real_leak FROM public.clients
    WHERE demo_batch_id = p_batch_id AND is_demo = false;

  SELECT count(*) INTO v_orphan_profiles FROM public.profiles p
    WHERE p.is_demo = true AND p.demo_batch_id = p_batch_id
      AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

  -- Rows in this batch missing is_demo flag
  SELECT count(*) INTO v_missing_batch FROM public.clients
    WHERE demo_batch_id = p_batch_id AND is_demo IS DISTINCT FROM true;

  -- Build checks JSON
  v_checks := v_checks || jsonb_build_object(
    'code','personas_count','label','6 personas provisionadas',
    'status', CASE WHEN v_profiles_count = 6 THEN 'pass'
                   WHEN v_profiles_count BETWEEN 1 AND 5 THEN 'warn'
                   ELSE 'fail' END,
    'detail', v_profiles_count || ' perfil(is) demo encontrado(s)',
    'count', v_profiles_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','roles_admin','label','1 admin demo',
    'status', CASE WHEN v_admin_count = 1 THEN 'pass' ELSE 'fail' END,
    'detail', v_admin_count || ' admin(s)', 'count', v_admin_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','roles_collab','label','2 colaboradores demo',
    'status', CASE WHEN v_collab_count = 2 THEN 'pass' ELSE 'fail' END,
    'detail', v_collab_count || ' colaborador(es)', 'count', v_collab_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','roles_client','label','3 clientes demo',
    'status', CASE WHEN v_client_count = 3 THEN 'pass' ELSE 'fail' END,
    'detail', v_client_count || ' cliente(s)', 'count', v_client_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','clients','label','3 empresas demo',
    'status', CASE WHEN v_clients_count = 3 THEN 'pass'
                   WHEN v_clients_count > 0 THEN 'warn' ELSE 'fail' END,
    'detail', v_clients_count || ' empresa(s)', 'count', v_clients_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','collab_active','label','Vínculos de colaboradores ativos',
    'status', CASE WHEN v_active_collab_links > 0 AND v_bad_status_collab = 0 THEN 'pass'
                   WHEN v_bad_status_collab > 0 THEN 'fail'
                   ELSE 'warn' END,
    'detail', v_active_collab_links || ' ativos, ' || v_bad_status_collab || ' com status inválido',
    'count', v_active_collab_links
  );

  v_checks := v_checks || jsonb_build_object(
    'code','client_users','label','Vínculos client_users',
    'status', CASE WHEN v_client_user_links > 0 THEN 'pass' ELSE 'fail' END,
    'detail', v_client_user_links || ' vínculo(s)', 'count', v_client_user_links
  );

  v_checks := v_checks || jsonb_build_object(
    'code','processes','label','Processos criados',
    'status', CASE WHEN v_processes_count > 0 THEN 'pass' ELSE 'warn' END,
    'detail', v_processes_count || ' processo(s), ' || v_steps_count || ' etapa(s)',
    'count', v_processes_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','checklist','label','Itens de checklist',
    'status', CASE WHEN v_checklist_count > 0 THEN 'pass' ELSE 'warn' END,
    'detail', v_checklist_count || ' item(s)', 'count', v_checklist_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','guides','label','Guias tributárias',
    'status', CASE WHEN v_guides_count > 0 THEN 'pass' ELSE 'warn' END,
    'detail', v_guides_count || ' guia(s)', 'count', v_guides_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','notifications','label','Notificações',
    'status', CASE WHEN v_notifications_count > 0 THEN 'pass' ELSE 'warn' END,
    'detail', v_notifications_count || ' notificação(ões)', 'count', v_notifications_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','timeline','label','Eventos de timeline',
    'status', CASE WHEN v_timeline_count > 0 THEN 'pass' ELSE 'warn' END,
    'detail', v_timeline_count || ' evento(s)', 'count', v_timeline_count
  );

  v_checks := v_checks || jsonb_build_object(
    'code','documents','label','Documentos',
    'status', CASE WHEN v_docs_count >= 0 THEN 'pass' ELSE 'warn' END,
    'detail', v_docs_count || ' documento(s)', 'count', v_docs_count
  );

  -- Contamination
  v_checks := v_checks || jsonb_build_object(
    'code','no_real_leak','label','Sem dados reais no lote',
    'status', CASE WHEN v_real_leak = 0 THEN 'pass' ELSE 'fail' END,
    'detail', v_real_leak || ' registro(s) reais com este batch_id',
    'count', v_real_leak
  );

  v_checks := v_checks || jsonb_build_object(
    'code','no_orphan_profiles','label','Perfis demo com conta de autenticação',
    'status', CASE WHEN v_orphan_profiles = 0 THEN 'pass' ELSE 'fail' END,
    'detail', v_orphan_profiles || ' perfil(is) órfão(s)',
    'count', v_orphan_profiles
  );

  v_checks := v_checks || jsonb_build_object(
    'code','is_demo_consistent','label','Marcação is_demo consistente',
    'status', CASE WHEN v_missing_batch = 0 THEN 'pass' ELSE 'fail' END,
    'detail', v_missing_batch || ' cliente(s) sem is_demo=true',
    'count', v_missing_batch
  );

  -- Overall
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'fail') THEN
    v_overall := 'fail';
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'warn') THEN
    v_overall := 'warn';
  END IF;

  -- Audit (read-only op, but log the summary)
  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (
    auth.uid(),
    'batch_validated',
    p_batch_id,
    jsonb_build_object(
      'overall', v_overall,
      'checks_total', jsonb_array_length(v_checks),
      'fails', (SELECT count(*) FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'fail'),
      'warns', (SELECT count(*) FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'warn')
    )
  );

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'label', v_batch.label,
    'overall', v_overall,
    'checks', v_checks,
    'validated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_demo_validate_batch(uuid) TO authenticated;
