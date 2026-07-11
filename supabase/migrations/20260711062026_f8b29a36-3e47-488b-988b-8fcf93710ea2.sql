
-- =========================================================================
-- 1. Add demo flags to user_roles / client_collaborators / client_users
-- =========================================================================
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL;

ALTER TABLE public.client_collaborators
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL;

ALTER TABLE public.client_users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_batch_id uuid REFERENCES public.demo_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_demo ON public.user_roles(demo_batch_id) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_client_collaborators_demo ON public.client_collaborators(demo_batch_id) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_client_users_demo ON public.client_users(demo_batch_id) WHERE is_demo = true;

-- =========================================================================
-- 2. Cross-contamination triggers (real <-> demo blocking)
-- =========================================================================

-- Notifications: recipient's demo status must match
CREATE OR REPLACE FUNCTION public.enforce_notification_demo_consistency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient_is_demo boolean;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(is_demo, false) INTO recipient_is_demo FROM public.profiles WHERE id = NEW.user_id;
  IF recipient_is_demo IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.is_demo, false) <> recipient_is_demo THEN
    RAISE EXCEPTION 'Notificação % não pode ser enviada para usuário %',
      CASE WHEN NEW.is_demo THEN 'demo' ELSE 'real' END,
      CASE WHEN recipient_is_demo THEN 'real (destinatário demo)' ELSE 'demo (destinatário real)' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notification_demo_consistency ON public.notifications;
CREATE TRIGGER trg_notification_demo_consistency
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_notification_demo_consistency();

-- Client_collaborators: client and collaborator must both be real or both demo
CREATE OR REPLACE FUNCTION public.enforce_client_collab_demo_consistency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c_demo boolean; k_demo boolean;
BEGIN
  SELECT coalesce(is_demo, false) INTO c_demo FROM public.clients WHERE id = NEW.client_id;
  SELECT coalesce(is_demo, false) INTO k_demo FROM public.collaborators WHERE id = NEW.collaborator_id;
  IF c_demo IS NULL OR k_demo IS NULL THEN RETURN NEW; END IF;
  IF c_demo <> k_demo THEN
    RAISE EXCEPTION 'Vínculo bloqueado: cliente % e colaborador % têm origens diferentes (real/demo)',
      NEW.client_id, NEW.collaborator_id;
  END IF;
  -- Auto-inherit demo flag from parent
  IF c_demo THEN
    NEW.is_demo := true;
    IF NEW.demo_batch_id IS NULL THEN
      SELECT demo_batch_id INTO NEW.demo_batch_id FROM public.clients WHERE id = NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_client_collab_demo_consistency ON public.client_collaborators;
CREATE TRIGGER trg_client_collab_demo_consistency
BEFORE INSERT OR UPDATE ON public.client_collaborators
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_collab_demo_consistency();

-- Client_users: client and user (profile) must both be real or both demo
CREATE OR REPLACE FUNCTION public.enforce_client_user_demo_consistency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c_demo boolean; p_demo boolean;
BEGIN
  SELECT coalesce(is_demo, false) INTO c_demo FROM public.clients WHERE id = NEW.client_id;
  SELECT coalesce(is_demo, false) INTO p_demo FROM public.profiles WHERE id = NEW.user_id;
  IF c_demo IS NULL OR p_demo IS NULL THEN RETURN NEW; END IF;
  IF c_demo <> p_demo THEN
    RAISE EXCEPTION 'Vínculo bloqueado: cliente % e usuário % têm origens diferentes (real/demo)',
      NEW.client_id, NEW.user_id;
  END IF;
  IF c_demo THEN
    NEW.is_demo := true;
    IF NEW.demo_batch_id IS NULL THEN
      SELECT demo_batch_id INTO NEW.demo_batch_id FROM public.clients WHERE id = NEW.client_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_client_user_demo_consistency ON public.client_users;
CREATE TRIGGER trg_client_user_demo_consistency
BEFORE INSERT OR UPDATE ON public.client_users
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_user_demo_consistency();

-- =========================================================================
-- 3. RPC to return demo user ids of a batch (used by wipe to delete auth users)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_demo_persona_user_ids(_batch_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, role text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT p.id, coalesce(ur.role::text, 'unknown'), u.email::text
    FROM public.profiles p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id AND ur.is_demo = true
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.is_demo = true
      AND (_batch_id IS NULL OR p.demo_batch_id = _batch_id);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_demo_persona_user_ids(uuid) TO authenticated;

-- =========================================================================
-- 4. New seed function that receives pre-created auth users from server fn
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_demo_seed_batch(
  _label text,
  _personas jsonb  -- [{user_id, role, full_name, email, label}]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_batch uuid;
  v_admin uuid := auth.uid();
  v_persona jsonb;
  v_admin_demo uuid;
  v_collab1 uuid; v_collab2 uuid;
  v_collab1_row uuid; v_collab2_row uuid;
  v_client_user1 uuid; v_client_user2 uuid; v_client_user3 uuid;
  v_client1 uuid; v_client2 uuid; v_client3 uuid;
  v_ptype_abertura uuid; v_ptype_alteracao uuid;
  v_counts jsonb;
  v_role text; v_uid uuid;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.demo_batches(label, created_by) VALUES (_label, v_admin) RETURNING id INTO v_batch;

  -- Create profiles + user_roles for each persona, all demo
  FOR v_persona IN SELECT * FROM jsonb_array_elements(_personas) LOOP
    v_uid  := (v_persona->>'user_id')::uuid;
    v_role := v_persona->>'role';

    INSERT INTO public.profiles(id, full_name, is_demo, demo_batch_id)
    VALUES (v_uid, v_persona->>'full_name', true, v_batch)
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, is_demo = true, demo_batch_id = v_batch;

    INSERT INTO public.user_roles(user_id, role, is_demo, demo_batch_id)
    VALUES (v_uid, v_role::app_role, true, v_batch)
    ON CONFLICT (user_id, role) DO UPDATE SET is_demo = true, demo_batch_id = v_batch;

    IF v_role = 'admin' THEN v_admin_demo := v_uid;
    ELSIF v_role = 'collaborator' AND v_collab1 IS NULL THEN v_collab1 := v_uid;
    ELSIF v_role = 'collaborator' THEN v_collab2 := v_uid;
    ELSIF v_role = 'client' AND v_client_user1 IS NULL THEN v_client_user1 := v_uid;
    ELSIF v_role = 'client' AND v_client_user2 IS NULL THEN v_client_user2 := v_uid;
    ELSIF v_role = 'client' THEN v_client_user3 := v_uid;
    END IF;
  END LOOP;

  -- Collaborators rows
  INSERT INTO public.collaborators(user_id, nome, email, cargo, departamento, status, is_demo, demo_batch_id)
  VALUES (v_collab1, '[DEMO] Colaborador Sênior', (SELECT email FROM auth.users WHERE id = v_collab1),
          'Contador Sênior', 'contabil', 'ativo', true, v_batch)
  RETURNING id INTO v_collab1_row;

  INSERT INTO public.collaborators(user_id, nome, email, cargo, departamento, status, is_demo, demo_batch_id)
  VALUES (v_collab2, '[DEMO] Colaborador Fiscal', (SELECT email FROM auth.users WHERE id = v_collab2),
          'Analista Fiscal', 'fiscal', 'ativo', true, v_batch)
  RETURNING id INTO v_collab2_row;

  -- =============== 3 clients with 3 scenarios ================
  -- Scenario A: empresa em dia
  INSERT INTO public.clients(razao_social, nome_fantasia, documento, tipo, status, observacoes,
                             is_demo, demo_batch_id, origem_cadastro)
  VALUES ('[DEMO] Comércio Em Dia LTDA', 'Comércio Em Dia', '00.000.000/0001-91', 'PJ', 'active',
          'Cenário: empresa em dia', true, v_batch, 'demo')
  RETURNING id INTO v_client1;

  -- Scenario B: com pendências
  INSERT INTO public.clients(razao_social, nome_fantasia, documento, tipo, status, observacoes,
                             is_demo, demo_batch_id, origem_cadastro)
  VALUES ('[DEMO] Serviços Pendências LTDA', 'Serviços Pendências', '00.000.000/0002-72', 'PJ', 'active',
          'Cenário: empresa com pendências', true, v_batch, 'demo')
  RETURNING id INTO v_client2;

  -- Scenario C: onboarding recente (também será o "sem colaborador")
  INSERT INTO public.clients(razao_social, nome_fantasia, documento, tipo, status, observacoes,
                             is_demo, demo_batch_id, origem_cadastro)
  VALUES ('[DEMO] Nova Empresa Onboarding LTDA', 'Nova Onboarding', '00.000.000/0003-53', 'PJ', 'active',
          'Cenário: onboarding recente / sem colaborador', true, v_batch, 'demo')
  RETURNING id INTO v_client3;

  -- Vínculos colaborador↔cliente (client3 fica SEM colaborador propositalmente)
  INSERT INTO public.client_collaborators(client_id, collaborator_id, is_demo, demo_batch_id)
  VALUES (v_client1, v_collab1_row, true, v_batch),
         (v_client2, v_collab2_row, true, v_batch);

  -- Vínculos usuário-cliente ↔ empresa
  INSERT INTO public.client_users(client_id, user_id, is_demo, demo_batch_id)
  VALUES (v_client1, v_client_user1, true, v_batch),
         (v_client2, v_client_user2, true, v_batch),
         (v_client3, v_client_user3, true, v_batch);

  -- Checklist por cenário
  INSERT INTO public.client_checklist_items(client_id, titulo, categoria, prazo, status, origem, is_demo, demo_batch_id)
  VALUES
    -- em dia
    (v_client1, 'Envio de NF-e do mês', 'fiscal', CURRENT_DATE + 15, 'concluida', 'manual', true, v_batch),
    (v_client1, 'DAS quitado', 'fiscal', CURRENT_DATE + 20, 'concluida', 'automatico', true, v_batch),
    -- pendências
    (v_client2, 'DAS em atraso', 'fiscal', CURRENT_DATE - 5, 'pendente', 'automatico', true, v_batch),
    (v_client2, 'Folha de pagamento pendente', 'trabalhista', CURRENT_DATE - 2, 'pendente', 'automatico', true, v_batch),
    (v_client2, 'Enviar declaração acessória', 'fiscal', CURRENT_DATE + 3, 'pendente', 'manual', true, v_batch),
    -- onboarding
    (v_client3, 'Coletar documentos societários', 'societario', CURRENT_DATE + 2, 'pendente', 'manual', true, v_batch),
    (v_client3, 'Consulta de viabilidade', 'societario', CURRENT_DATE + 5, 'pendente', 'manual', true, v_batch);

  -- Guias
  INSERT INTO public.tax_guides(client_id, tipo, competencia, vencimento, valor, status, is_demo, demo_batch_id)
  VALUES
    (v_client1, 'DAS',  '2026-06', CURRENT_DATE + 10, 250.00, 'paga',    true, v_batch),
    (v_client2, 'DAS',  '2026-05', CURRENT_DATE - 5,  380.00, 'gerada',  true, v_batch),
    (v_client2, 'INSS', '2026-05', CURRENT_DATE - 2,  920.00, 'gerada',  true, v_batch);

  -- Tipos e etapas de processo demo
  INSERT INTO public.process_types(nome, categoria, descricao, status, ordem, is_demo, demo_batch_id)
  VALUES ('[DEMO] Abertura de Empresa', 'societario', 'Modelo demo', 'ativo', 100, true, v_batch)
  RETURNING id INTO v_ptype_abertura;

  INSERT INTO public.process_types(nome, categoria, descricao, status, ordem, is_demo, demo_batch_id)
  VALUES ('[DEMO] Alteração Contratual', 'societario', 'Modelo demo', 'ativo', 101, true, v_batch)
  RETURNING id INTO v_ptype_alteracao;

  INSERT INTO public.process_steps(process_type_id, nome, descricao, ordem, departamento, prazo_dias, prazo_tipo,
                                   obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual, is_demo, demo_batch_id)
  VALUES
    (v_ptype_abertura, 'Coletar documentos', 'RG/CPF/comprovante', 1, 'societario',  3, 'abertura', true,  true, true, true, true, v_batch),
    (v_ptype_abertura, 'Viabilidade',        'Prefeitura',        2, 'societario',  5, 'abertura', true, false, true, true, true, v_batch),
    (v_ptype_abertura, 'Junta',              'Contrato social',   3, 'societario', 10, 'abertura', true,  true, true, true, true, v_batch),
    (v_ptype_abertura, 'CNPJ',               'Emitir',            4, 'societario', 15, 'abertura', true, false, true, true, true, v_batch),
    (v_ptype_alteracao,'Análise',            'Revisar cláusulas', 1, 'societario',  2, 'abertura', true, false, false,true, true, v_batch),
    (v_ptype_alteracao,'Aditivo',            'Elaborar minuta',   2, 'societario',  3, 'abertura', true,  true, true, true, true, v_batch),
    (v_ptype_alteracao,'Protocolo',          'Registrar',         3, 'societario',  7, 'abertura', true,  true, true, true, true, v_batch);

  -- Abrir processos apenas para os cenários "pendências" e "onboarding"
  PERFORM public.open_company_process(v_client2, v_ptype_alteracao, NULL, NULL, 'media', '[DEMO] Alteração em andamento', true, v_batch);
  PERFORM public.open_company_process(v_client3, v_ptype_abertura,  NULL, NULL, 'alta',  '[DEMO] Abertura em andamento',  true, v_batch);

  -- Notificações: uma para cada persona demo (nunca para usuários reais)
  INSERT INTO public.notifications(user_id, tipo, titulo, mensagem, is_demo, demo_batch_id)
  SELECT (v_persona->>'user_id')::uuid, 'sistema',
         '[DEMO] Bem-vindo ao ambiente de homologação',
         'Este é um ambiente de teste. Todos os dados serão removidos ao limpar o lote.',
         true, v_batch
  FROM jsonb_array_elements(_personas) v_persona;

  -- Timeline
  INSERT INTO public.timeline_events(client_id, tipo, descricao, actor_profile_id, metadata, is_demo, demo_batch_id)
  VALUES (v_client1, 'ambiente_demo_criado', 'Ambiente demo criado', v_admin,
          jsonb_build_object('batch_id', v_batch, 'label', _label), true, v_batch);

  v_counts := jsonb_build_object(
    'personas', jsonb_array_length(_personas),
    'clients', 3, 'collaborators', 2, 'client_users', 3, 'client_collaborators', 2,
    'checklist_items', 7, 'tax_guides', 3, 'notifications', jsonb_array_length(_personas),
    'process_types', 2, 'process_steps', 7, 'company_processes', 2,
    'scenarios', jsonb_build_array('empresa_em_dia','com_pendencias','onboarding','sem_colaborador')
  );

  UPDATE public.demo_batches SET counts_json = v_counts, updated_at = now() WHERE id = v_batch;

  INSERT INTO public.demo_audit_log(admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'create_environment', v_batch,
          jsonb_build_object('label', _label, 'counts', v_counts,
                             'persona_roles', (SELECT jsonb_agg(p->>'role') FROM jsonb_array_elements(_personas) p)));

  RETURN jsonb_build_object('batch_id', v_batch, 'counts', v_counts);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_demo_seed_batch(text, jsonb) TO authenticated;

-- =========================================================================
-- 5. Extend wipe / preview to include new tables
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_demo_wipe(_batch_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_deleted bigint; t text;
  tables text[] := ARRAY[
    'timeline_events','notifications','tax_guides','document_requests',
    'client_checklist_items','documents','company_process_steps','company_processes',
    'process_steps','process_types','plan_items','plans',
    'client_users','client_collaborators',
    'collaborators','clients',
    'user_roles','profiles'
  ];
  where_clause text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;

  -- Safety: same contamination checks
  PERFORM 1 FROM public.company_processes cp
    JOIN public.process_types pt ON pt.id = cp.process_type_id
    WHERE pt.is_demo = true AND coalesce(cp.is_demo,false) = false
      AND (_batch_id IS NULL OR pt.demo_batch_id = _batch_id);
  IF FOUND THEN RAISE EXCEPTION 'Contaminação detectada: processos reais vinculados a tipo de processo demo. Limpeza abortada.'; END IF;

  PERFORM 1 FROM public.client_checklist_items cci
    JOIN public.clients c ON c.id = cci.client_id
    WHERE c.is_demo = true AND coalesce(cci.is_demo,false) = false
      AND (_batch_id IS NULL OR c.demo_batch_id = _batch_id);
  IF FOUND THEN RAISE EXCEPTION 'Contaminação detectada: itens de checklist reais em empresa demo. Limpeza abortada.'; END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DELETE FROM public.%I %s', t, where_clause);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object(t, v_deleted);
  END LOOP;

  IF _batch_id IS NOT NULL THEN
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE id = _batch_id;
  ELSE
    UPDATE public.demo_batches SET status = 'wiped', updated_at = now() WHERE status = 'active';
  END IF;

  INSERT INTO public.demo_audit_log(admin_id, action, batch_id, payload_json)
  VALUES (v_admin, 'wipe', _batch_id, jsonb_build_object('deleted', v_counts));

  RETURN v_counts;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_demo_wipe_preview(_batch_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_n bigint; t text;
  tables text[] := ARRAY[
    'timeline_events','notifications','tax_guides','document_requests',
    'client_checklist_items','documents','company_process_steps','company_processes',
    'process_steps','process_types','plan_items','plans',
    'client_users','client_collaborators',
    'collaborators','clients',
    'user_roles','profiles'
  ];
  where_clause text;
BEGIN
  IF NOT public.has_role(v_admin, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  where_clause := 'WHERE is_demo = true';
  IF _batch_id IS NOT NULL THEN
    where_clause := where_clause || format(' AND demo_batch_id = %L', _batch_id);
  END IF;
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I %s', t, where_clause) INTO v_n;
    v_counts := v_counts || jsonb_build_object(t, v_n);
  END LOOP;
  RETURN v_counts;
END $function$;
