-- ============================================================
-- Central de Documentos: criação direta de solicitações
-- ============================================================

-- 1) Lista de itens de checklist elegíveis para virar solicitação
CREATE OR REPLACE FUNCTION public.workspace_checklist_precisa_solicitar_list(
  _client_id uuid DEFAULT NULL,
  _competencia text DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_demo boolean DEFAULT true,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_page integer := GREATEST(COALESCE(_page, 1), 1);
  v_size integer := LEAST(GREATEST(COALESCE(_page_size, 20), 1), 100);
  v_total integer;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'collaborator')) THEN
    RAISE EXCEPTION 'Acesso restrito à equipe.' USING ERRCODE = '42501';
  END IF;
  v_admin := public.has_role(v_uid, 'admin');

  CREATE TEMP TABLE IF NOT EXISTS _tmp_noop_ptr (x int) ON COMMIT DROP;

  WITH base AS (
    SELECT
      ci.id,
      ci.client_id,
      ci.titulo,
      ci.categoria,
      ci.competencia,
      ci.prazo,
      ci.origem,
      ci.is_demo,
      ci.demo_batch_id,
      ci.responsavel_profile_id,
      ci.observacao,
      ci.created_at,
      COALESCE(c.nome_fantasia, c.razao_social) AS empresa_nome,
      c.documento AS empresa_documento,
      p.full_name AS responsavel_nome
    FROM public.client_checklist_items ci
    JOIN public.clients c ON c.id = ci.client_id AND c.deleted_at IS NULL
    LEFT JOIN public.profiles p ON p.id = ci.responsavel_profile_id
    WHERE ci.deleted_at IS NULL
      AND ci.status = 'pendente'
      AND ci.document_request_id IS NULL
      AND ci.document_id IS NULL
      AND (_client_id IS NULL OR ci.client_id = _client_id)
      AND (_competencia IS NULL OR ci.competencia = _competencia)
      AND (_include_demo OR NOT ci.is_demo)
      AND (
        _search IS NULL OR _search = ''
        OR ci.titulo ILIKE '%' || _search || '%'
        OR COALESCE(c.nome_fantasia, c.razao_social) ILIKE '%' || _search || '%'
      )
      AND (
        v_admin
        OR c.owner_profile_id = v_uid
        OR EXISTS (
          SELECT 1 FROM public.client_collaborators cc
          JOIN public.collaborators col ON col.id = cc.collaborator_id
          WHERE cc.client_id = ci.client_id AND col.user_id = v_uid
        )
      )
  ), counted AS (
    SELECT COUNT(*)::int AS total FROM base
  ), paged AS (
    SELECT * FROM base
    ORDER BY prazo NULLS LAST, created_at DESC, id
    LIMIT v_size OFFSET (v_page - 1) * v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE(jsonb_agg(to_jsonb(paged) ORDER BY paged.prazo NULLS LAST, paged.created_at DESC), '[]'::jsonb)
    INTO v_total, v_rows
    FROM paged;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', v_page,
    'page_size', v_size
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.workspace_checklist_precisa_solicitar_list(uuid, text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_checklist_precisa_solicitar_list(uuid, text, text, boolean, integer, integer) TO authenticated;

-- 2) Verificação de possível duplicidade (apenas alerta)
CREATE OR REPLACE FUNCTION public.staff_check_duplicate_document_request(
  _client_id uuid,
  _competencia text DEFAULT NULL,
  _categoria text DEFAULT NULL,
  _tipo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'collaborator')) THEN
    RAISE EXCEPTION 'Acesso restrito à equipe.' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.owner_profile_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
               JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = _client_id AND col.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'titulo', r.titulo, 'status', r.status,
           'competencia', r.competencia, 'categoria', r.categoria,
           'tipo_solicitacao', r.tipo_solicitacao, 'created_at', r.created_at
         ) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT * FROM public.document_requests dr
       WHERE dr.client_id = _client_id
         AND dr.deleted_at IS NULL
         AND dr.status IN ('aguardando','recebido','reenviar')
         AND (_competencia IS NULL OR dr.competencia = _competencia)
         AND (
           (_categoria IS NOT NULL AND dr.categoria = _categoria)
           OR (_tipo IS NOT NULL AND dr.tipo_solicitacao = _tipo)
         )
       ORDER BY dr.created_at DESC
       LIMIT 5
    ) r;

  RETURN jsonb_build_object('possiveis_duplicatas', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_check_duplicate_document_request(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_check_duplicate_document_request(uuid, text, text, text) TO authenticated;

-- 3) Criação transacional da solicitação pela equipe
CREATE OR REPLACE FUNCTION public.staff_create_document_request(
  _client_id uuid,
  _titulo text,
  _descricao text DEFAULT NULL,
  _competencia text DEFAULT NULL,
  _categoria text DEFAULT NULL,
  _tipo_solicitacao text DEFAULT NULL,
  _departamento text DEFAULT NULL,
  _prazo date DEFAULT NULL,
  _urgencia text DEFAULT 'normal',
  _responsavel_profile_id uuid DEFAULT NULL,
  _observacoes_internas text DEFAULT NULL,
  _checklist_item_id uuid DEFAULT NULL,
  _company_process_id uuid DEFAULT NULL,
  _company_process_step_id uuid DEFAULT NULL,
  _company_process_step_requirement_id uuid DEFAULT NULL
)
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
  v_step_proc uuid;
  v_req_step uuid;
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
  IF v_urg NOT IN ('baixa','normal','alta') THEN
    RAISE EXCEPTION 'Urgência inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = _client_id AND deleted_at IS NULL;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_admin
    OR v_client.owner_profile_id = v_uid
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
               JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = _client_id AND col.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  v_is_demo := COALESCE(v_client.is_demo, false);
  v_batch := CASE WHEN v_is_demo THEN v_client.demo_batch_id ELSE NULL END;

  -- responsável precisa ser staff ativo
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

  -- checklist
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
         AND dr.status IN ('aguardando','recebido','reenviar')
    ) THEN
      RAISE EXCEPTION 'Este item já possui uma solicitação ativa.' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- vínculos de processo (empresa/etapa/requisito) — validação explícita
  IF _company_process_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.company_processes cp
                    WHERE cp.id = _company_process_id AND cp.client_id = _client_id) THEN
      RAISE EXCEPTION 'Processo inválido para esta empresa.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF _company_process_step_id IS NOT NULL THEN
    SELECT s.company_process_id INTO v_step_proc
      FROM public.company_process_steps s WHERE s.id = _company_process_step_id;
    IF v_step_proc IS NULL OR (_company_process_id IS NOT NULL AND v_step_proc <> _company_process_id) THEN
      RAISE EXCEPTION 'Etapa inválida para o processo informado.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.company_processes cp
                    WHERE cp.id = v_step_proc AND cp.client_id = _client_id) THEN
      RAISE EXCEPTION 'Etapa pertence a outra empresa.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF _company_process_step_requirement_id IS NOT NULL THEN
    SELECT r.company_process_step_id INTO v_req_step
      FROM public.company_process_step_requirements r
     WHERE r.id = _company_process_step_requirement_id;
    IF v_req_step IS NULL OR (_company_process_step_id IS NOT NULL AND v_req_step <> _company_process_step_id) THEN
      RAISE EXCEPTION 'Requisito inválido para a etapa informada.' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.document_requests (
    client_id, titulo, descricao, competencia, categoria, tipo_solicitacao,
    departamento, prazo, urgencia, responsavel_profile_id, observacoes_internas,
    status, criado_por, criado_por_role,
    company_process_id, company_process_step_id, company_process_step_requirement_id,
    is_demo, demo_batch_id
  ) VALUES (
    _client_id, v_titulo, NULLIF(btrim(_descricao),''), NULLIF(btrim(_competencia),''),
    NULLIF(btrim(_categoria),''), NULLIF(btrim(_tipo_solicitacao),''),
    NULLIF(btrim(_departamento),''), _prazo, v_urg,
    COALESCE(_responsavel_profile_id, v_uid), NULLIF(btrim(_observacoes_internas),''),
    'aguardando', v_uid, CASE WHEN v_admin THEN 'admin' ELSE 'collaborator' END,
    _company_process_id, _company_process_step_id, _company_process_step_requirement_id,
    v_is_demo, v_batch
  )
  RETURNING * INTO v_new;

  IF _checklist_item_id IS NOT NULL THEN
    UPDATE public.client_checklist_items
       SET document_request_id = v_new.id,
           updated_at = now()
     WHERE id = _checklist_item_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'client_id', v_new.client_id,
    'titulo', v_new.titulo,
    'status', v_new.status,
    'competencia', v_new.competencia,
    'categoria', v_new.categoria,
    'tipo_solicitacao', v_new.tipo_solicitacao,
    'departamento', v_new.departamento,
    'prazo', v_new.prazo,
    'urgencia', v_new.urgencia,
    'responsavel_profile_id', v_new.responsavel_profile_id,
    'checklist_item_id', _checklist_item_id,
    'company_process_id', v_new.company_process_id,
    'company_process_step_id', v_new.company_process_step_id,
    'company_process_step_requirement_id', v_new.company_process_step_requirement_id,
    'is_demo', v_new.is_demo,
    'created_at', v_new.created_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_create_document_request(uuid, text, text, text, text, text, text, date, text, uuid, text, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_create_document_request(uuid, text, text, text, text, text, text, date, text, uuid, text, uuid, uuid, uuid, uuid) TO authenticated;