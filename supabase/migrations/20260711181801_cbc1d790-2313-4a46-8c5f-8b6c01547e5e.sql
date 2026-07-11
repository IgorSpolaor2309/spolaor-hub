
-- ============= demo_validation_runs =============
CREATE TABLE public.demo_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.demo_batches(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  run_label text,
  overall text NOT NULL CHECK (overall IN ('pass','warn','fail')),
  checks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_demo_validation_runs_batch ON public.demo_validation_runs(batch_id, created_at DESC);

GRANT SELECT, INSERT ON public.demo_validation_runs TO authenticated;
GRANT ALL ON public.demo_validation_runs TO service_role;
ALTER TABLE public.demo_validation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read validation runs" ON public.demo_validation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert validation runs" ON public.demo_validation_runs
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============= demo_manual_test_steps =============
CREATE TABLE public.demo_manual_test_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.demo_validation_runs(id) ON DELETE CASCADE,
  persona_role text NOT NULL,
  persona_label text NOT NULL,
  persona_email text NOT NULL,
  step_code text NOT NULL,
  step_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','pass','fail','skip')),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_demo_manual_test_steps_run ON public.demo_manual_test_steps(run_id);

GRANT SELECT, INSERT, UPDATE ON public.demo_manual_test_steps TO authenticated;
GRANT ALL ON public.demo_manual_test_steps TO service_role;
ALTER TABLE public.demo_manual_test_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage manual steps" ON public.demo_manual_test_steps
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_demo_manual_steps_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_demo_manual_steps_updated_at
  BEFORE UPDATE ON public.demo_manual_test_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_demo_manual_steps_updated_at();

-- ============= Modify validate function to persist run + seed manual steps =============
CREATE OR REPLACE FUNCTION public.admin_demo_validate_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_overall text := 'pass';
  v_batch record;
  v_run_id uuid;

  v_profiles_count int; v_admin_count int; v_collab_count int; v_client_count int;
  v_clients_count int; v_active_collab_links int; v_bad_status_collab int;
  v_client_user_links int; v_processes_count int; v_steps_count int;
  v_checklist_count int; v_guides_count int; v_notifications_count int;
  v_timeline_count int; v_docs_count int;
  v_orphan_profiles int; v_real_leak int; v_missing_batch int;
  v_persona record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_batch_id IS NULL THEN RAISE EXCEPTION 'batch_id_required'; END IF;

  SELECT * INTO v_batch FROM public.demo_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'batch_not_found'; END IF;

  SELECT count(*) INTO v_profiles_count FROM public.profiles WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_admin_count FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id WHERE p.is_demo AND p.demo_batch_id = p_batch_id AND ur.role = 'admin';
  SELECT count(*) INTO v_collab_count FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id WHERE p.is_demo AND p.demo_batch_id = p_batch_id AND ur.role = 'collaborator';
  SELECT count(*) INTO v_client_count FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id WHERE p.is_demo AND p.demo_batch_id = p_batch_id AND ur.role = 'client';
  SELECT count(*) INTO v_clients_count FROM public.clients WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_active_collab_links FROM public.collaborators WHERE is_demo AND demo_batch_id = p_batch_id AND status = 'active';
  SELECT count(*) INTO v_bad_status_collab FROM public.collaborators WHERE is_demo AND demo_batch_id = p_batch_id AND status <> 'active';
  SELECT count(*) INTO v_client_user_links FROM public.client_users WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_processes_count FROM public.company_processes WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_steps_count FROM public.company_process_steps WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_checklist_count FROM public.client_checklist_items WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_guides_count FROM public.tax_guides WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_notifications_count FROM public.notifications WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_timeline_count FROM public.timeline_events WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_docs_count FROM public.documents WHERE is_demo AND demo_batch_id = p_batch_id;
  SELECT count(*) INTO v_real_leak FROM public.clients WHERE demo_batch_id = p_batch_id AND is_demo = false;
  SELECT count(*) INTO v_orphan_profiles FROM public.profiles p WHERE p.is_demo AND p.demo_batch_id = p_batch_id AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  SELECT count(*) INTO v_missing_batch FROM public.clients WHERE demo_batch_id = p_batch_id AND is_demo IS DISTINCT FROM true;

  v_checks := v_checks
    || jsonb_build_object('code','personas_count','label','6 personas provisionadas','status', CASE WHEN v_profiles_count = 6 THEN 'pass' WHEN v_profiles_count BETWEEN 1 AND 5 THEN 'warn' ELSE 'fail' END,'detail', v_profiles_count || ' perfil(is) demo encontrado(s)','count', v_profiles_count)
    || jsonb_build_object('code','roles_admin','label','1 admin demo','status', CASE WHEN v_admin_count = 1 THEN 'pass' ELSE 'fail' END,'detail', v_admin_count || ' admin(s)','count', v_admin_count)
    || jsonb_build_object('code','roles_collab','label','2 colaboradores demo','status', CASE WHEN v_collab_count = 2 THEN 'pass' ELSE 'fail' END,'detail', v_collab_count || ' colaborador(es)','count', v_collab_count)
    || jsonb_build_object('code','roles_client','label','3 clientes demo','status', CASE WHEN v_client_count = 3 THEN 'pass' ELSE 'fail' END,'detail', v_client_count || ' cliente(s)','count', v_client_count)
    || jsonb_build_object('code','clients','label','3 empresas demo','status', CASE WHEN v_clients_count = 3 THEN 'pass' WHEN v_clients_count > 0 THEN 'warn' ELSE 'fail' END,'detail', v_clients_count || ' empresa(s)','count', v_clients_count)
    || jsonb_build_object('code','collab_active','label','Vínculos de colaboradores ativos','status', CASE WHEN v_active_collab_links > 0 AND v_bad_status_collab = 0 THEN 'pass' WHEN v_bad_status_collab > 0 THEN 'fail' ELSE 'warn' END,'detail', v_active_collab_links || ' ativos, ' || v_bad_status_collab || ' com status inválido','count', v_active_collab_links)
    || jsonb_build_object('code','client_users','label','Vínculos client_users','status', CASE WHEN v_client_user_links > 0 THEN 'pass' ELSE 'fail' END,'detail', v_client_user_links || ' vínculo(s)','count', v_client_user_links)
    || jsonb_build_object('code','processes','label','Processos criados','status', CASE WHEN v_processes_count > 0 THEN 'pass' ELSE 'warn' END,'detail', v_processes_count || ' processo(s), ' || v_steps_count || ' etapa(s)','count', v_processes_count)
    || jsonb_build_object('code','checklist','label','Itens de checklist','status', CASE WHEN v_checklist_count > 0 THEN 'pass' ELSE 'warn' END,'detail', v_checklist_count || ' item(s)','count', v_checklist_count)
    || jsonb_build_object('code','guides','label','Guias tributárias','status', CASE WHEN v_guides_count > 0 THEN 'pass' ELSE 'warn' END,'detail', v_guides_count || ' guia(s)','count', v_guides_count)
    || jsonb_build_object('code','notifications','label','Notificações','status', CASE WHEN v_notifications_count > 0 THEN 'pass' ELSE 'warn' END,'detail', v_notifications_count || ' notificação(ões)','count', v_notifications_count)
    || jsonb_build_object('code','timeline','label','Eventos de timeline','status', CASE WHEN v_timeline_count > 0 THEN 'pass' ELSE 'warn' END,'detail', v_timeline_count || ' evento(s)','count', v_timeline_count)
    || jsonb_build_object('code','documents','label','Documentos','status','pass','detail', v_docs_count || ' documento(s)','count', v_docs_count)
    || jsonb_build_object('code','no_real_leak','label','Sem dados reais no lote','status', CASE WHEN v_real_leak = 0 THEN 'pass' ELSE 'fail' END,'detail', v_real_leak || ' registro(s) reais com este batch_id','count', v_real_leak)
    || jsonb_build_object('code','no_orphan_profiles','label','Perfis demo com conta de autenticação','status', CASE WHEN v_orphan_profiles = 0 THEN 'pass' ELSE 'fail' END,'detail', v_orphan_profiles || ' perfil(is) órfão(s)','count', v_orphan_profiles)
    || jsonb_build_object('code','is_demo_consistent','label','Marcação is_demo consistente','status', CASE WHEN v_missing_batch = 0 THEN 'pass' ELSE 'fail' END,'detail', v_missing_batch || ' cliente(s) sem is_demo=true','count', v_missing_batch);

  v_counts := jsonb_build_object(
    'profiles', v_profiles_count, 'admins', v_admin_count, 'collaborators', v_collab_count, 'clients_role', v_client_count,
    'clients', v_clients_count, 'collab_links_active', v_active_collab_links, 'client_users', v_client_user_links,
    'processes', v_processes_count, 'process_steps', v_steps_count, 'checklist', v_checklist_count,
    'guides', v_guides_count, 'notifications', v_notifications_count, 'timeline', v_timeline_count, 'documents', v_docs_count
  );

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'fail') THEN v_overall := 'fail';
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'warn') THEN v_overall := 'warn'; END IF;

  -- Persist run
  INSERT INTO public.demo_validation_runs (batch_id, admin_id, run_label, overall, checks_json, counts_json)
  VALUES (p_batch_id, auth.uid(), v_batch.label, v_overall, v_checks, v_counts)
  RETURNING id INTO v_run_id;

  -- Seed manual roadmap per persona (from profiles linked to this batch)
  FOR v_persona IN
    SELECT p.id AS user_id, p.full_name, p.email, COALESCE(
      (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id ORDER BY CASE ur.role WHEN 'admin' THEN 1 WHEN 'collaborator' THEN 2 WHEN 'client' THEN 3 ELSE 9 END LIMIT 1),
      'unknown'
    ) AS role
    FROM public.profiles p
    WHERE p.is_demo AND p.demo_batch_id = p_batch_id
  LOOP
    IF v_persona.role = 'admin' THEN
      INSERT INTO public.demo_manual_test_steps (run_id, persona_role, persona_label, persona_email, step_code, step_label) VALUES
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'login',        'Entrar via magic link'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'central',      'Acessar Central de Homologação'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'clientes',     'Listar todas as empresas demo'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'colaborador',  'Ver colaboradores e vínculos'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'no_real_leak', 'Confirmar que dados reais NÃO aparecem');
    ELSIF v_persona.role = 'collaborator' THEN
      INSERT INTO public.demo_manual_test_steps (run_id, persona_role, persona_label, persona_email, step_code, step_label) VALUES
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'login',      'Entrar via magic link'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'clientes',   'Ver apenas clientes demo vinculados'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'processo',   'Abrir processo demo e etapas'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'checklist',  'Marcar item de checklist demo'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'notif',      'Receber notificação demo'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'isolation',  'Confirmar que clientes reais NÃO aparecem');
    ELSIF v_persona.role = 'client' THEN
      INSERT INTO public.demo_manual_test_steps (run_id, persona_role, persona_label, persona_email, step_code, step_label) VALUES
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'login',       'Entrar via magic link'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'minha_area',  'Acessar Minha Área'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'processos',   'Ver meus processos demo'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'documentos',  'Enviar/visualizar documento demo'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'guias',       'Ver guias tributárias demo'),
        (v_run_id, v_persona.role, v_persona.full_name, v_persona.email, 'isolation',   'Confirmar que só vejo minha própria empresa');
    END IF;
  END LOOP;

  INSERT INTO public.demo_audit_log (admin_id, action, batch_id, payload_json)
  VALUES (auth.uid(), 'batch_validated', p_batch_id, jsonb_build_object(
    'run_id', v_run_id, 'overall', v_overall,
    'checks_total', jsonb_array_length(v_checks),
    'fails', (SELECT count(*) FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'fail'),
    'warns', (SELECT count(*) FROM jsonb_array_elements(v_checks) x WHERE x->>'status' = 'warn')
  ));

  RETURN jsonb_build_object(
    'run_id', v_run_id, 'batch_id', p_batch_id, 'label', v_batch.label,
    'overall', v_overall, 'checks', v_checks, 'counts', v_counts, 'validated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_demo_validate_batch(uuid) TO authenticated;

-- ============= Read/update helpers =============
CREATE OR REPLACE FUNCTION public.admin_demo_list_validation_runs(_batch_id uuid DEFAULT NULL)
RETURNS SETOF public.demo_validation_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
    SELECT * FROM public.demo_validation_runs
    WHERE _batch_id IS NULL OR batch_id = _batch_id
    ORDER BY created_at DESC
    LIMIT 100;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_demo_list_validation_runs(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_demo_list_manual_steps(_run_id uuid)
RETURNS SETOF public.demo_manual_test_steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
    SELECT * FROM public.demo_manual_test_steps
    WHERE run_id = _run_id
    ORDER BY persona_role, persona_email, created_at;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_demo_list_manual_steps(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_demo_update_manual_step(_step_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS public.demo_manual_test_steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.demo_manual_test_steps;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _status NOT IN ('pending','pass','fail','skip') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.demo_manual_test_steps
     SET status = _status, notes = _notes, updated_by = auth.uid()
   WHERE id = _step_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'step_not_found'; END IF;
  RETURN v_row;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_demo_update_manual_step(uuid, text, text) TO authenticated;
