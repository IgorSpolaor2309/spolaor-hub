CREATE OR REPLACE FUNCTION public.staff_create_document_request(
  _client_id uuid, _titulo text, _descricao text DEFAULT NULL::text, _competencia text DEFAULT NULL::text,
  _categoria text DEFAULT NULL::text, _tipo_solicitacao text DEFAULT NULL::text, _departamento text DEFAULT NULL::text,
  _prazo date DEFAULT NULL::date, _urgencia text DEFAULT 'normal'::text, _responsavel_profile_id uuid DEFAULT NULL::uuid,
  _observacoes_internas text DEFAULT NULL::text, _checklist_item_id uuid DEFAULT NULL::uuid,
  _company_process_id uuid DEFAULT NULL::uuid, _company_process_step_id uuid DEFAULT NULL::uuid,
  _company_process_step_requirement_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_client public.clients%ROWTYPE;
  v_item public.client_checklist_items%ROWTYPE;
  v_is_demo boolean := false;
  v_batch uuid;
  v_titulo text := NULLIF(btrim(_titulo), '');
  v_urg text := COALESCE(NULLIF(btrim(_urgencia), ''), 'normal');
  v_new public.document_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'collaborator')) THEN
    RAISE EXCEPTION 'Acesso restrito à equipe.' USING ERRCODE = '42501';
  END IF;
  v_admin := public.has_role(v_uid, 'admin');

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Título é obrigatório.' USING ERRCODE = '22023';
  END IF;
  IF v_urg NOT IN ('baixa','normal','alta','urgente') THEN
    RAISE EXCEPTION 'Urgência inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = _client_id AND deleted_at IS NULL;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(
    v_admin
    OR (v_client.owner_profile_id IS NOT NULL AND v_client.owner_profile_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
               JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = _client_id
                 AND col.user_id = v_uid
                 AND COALESCE(col.status, 'active') = 'active'),
    false
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  v_is_demo := COALESCE(v_client.is_demo, false);
  v_batch := CASE WHEN v_is_demo THEN v_client.demo_batch_id ELSE NULL END;

  IF _responsavel_profile_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = _responsavel_profile_id
         AND p.status = 'active'
         AND EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = p.id AND ur.role IN ('admin','collaborator'))
    ) THEN
      RAISE EXCEPTION 'Responsável inválido.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _checklist_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.client_checklist_items
     WHERE id = _checklist_item_id AND deleted_at IS NULL;
    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'Item de checklist não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_item.client_id <> _client_id THEN
      RAISE EXCEPTION 'Item de checklist pertence a outra empresa.' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(v_item.is_demo,false) <> v_is_demo THEN
      RAISE EXCEPTION 'Mistura de dados reais e demo não é permitida.' USING ERRCODE = '23514';
    END IF;
    IF v_item.document_request_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.document_requests dr
       WHERE dr.id = v_item.document_request_id
         AND dr.deleted_at IS NULL
         AND dr.status NOT IN ('concluido','cancelado')
    ) THEN
      RAISE EXCEPTION 'Este item já possui uma solicitação ativa.' USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.document_requests (
    client_id, titulo, descricao, competencia, categoria, tipo_solicitacao, departamento,
    prazo, urgencia, responsavel_profile_id, observacoes_internas, status,
    checklist_item_id, company_process_id, company_process_step_id, company_process_step_requirement_id,
    criado_por, criado_por_role, is_demo, demo_batch_id
  ) VALUES (
    _client_id, v_titulo, NULLIF(btrim(_descricao),''),
    COALESCE(NULLIF(btrim(_competencia),''), v_item.competencia),
    COALESCE(NULLIF(btrim(_categoria),''), v_item.categoria),
    NULLIF(btrim(_tipo_solicitacao),''), NULLIF(btrim(_departamento),''),
    _prazo, v_urg, _responsavel_profile_id, NULLIF(btrim(_observacoes_internas),''), 'aguardando',
    _checklist_item_id, _company_process_id, _company_process_step_id, _company_process_step_requirement_id,
    v_uid, 'staff', v_is_demo, v_batch
  ) RETURNING * INTO v_new;

  IF _checklist_item_id IS NOT NULL THEN
    UPDATE public.client_checklist_items
       SET document_request_id = v_new.id, updated_at = now()
     WHERE id = _checklist_item_id;
  END IF;

  RETURN to_jsonb(v_new) - 'observacoes_internas' - 'criado_por_role';
END;
$function$;