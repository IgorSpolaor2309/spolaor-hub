-- =====================================================================
-- FASE 6 (parte 2) — RPCs de leitura com whitelist explícita para o MCP
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DOCUMENTOS DA EMPRESA — VISÃO DO CLIENTE (whitelist no banco)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_list_documents(
  p_client_id uuid,
  p_competencia text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  nome text,
  tipo text,
  competencia text,
  status text,
  data_validade date,
  categoria_validade text,
  vencido boolean,
  vencendo boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,20),1),100);
  v_offset int := GREATEST(COALESCE(p_offset,0),0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_users cu
     WHERE cu.client_id = p_client_id AND cu.user_id = v_uid AND cu.ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.client_id,
    d.nome,
    d.tipo,
    d.competencia,
    d.status,
    d.data_validade,
    d.categoria_validade,
    (d.data_validade IS NOT NULL AND d.data_validade < CURRENT_DATE),
    (d.data_validade IS NOT NULL
      AND d.data_validade >= CURRENT_DATE
      AND d.data_validade <= (CURRENT_DATE + 30)),
    d.created_at
  FROM public.documents d
  WHERE d.client_id = p_client_id
    AND d.deleted_at IS NULL
    AND (p_competencia IS NULL OR d.competencia = p_competencia)
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.client_list_documents(uuid,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_list_documents(uuid,text,integer,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_list_documents(uuid,text,integer,integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. DETALHE DA SOLICITAÇÃO — STAFF (whitelist + histórico + vínculos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_document_request_details_staff(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dr public.document_requests%ROWTYPE;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dr FROM public.document_requests
   WHERE id = _request_id AND deleted_at IS NULL;
  IF v_dr.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = v_dr.client_id AND c.owner_profile_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
                JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = v_dr.client_id AND col.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', v_dr.id,
    'client_id', v_dr.client_id,
    'empresa', (SELECT c.razao_social FROM public.clients c WHERE c.id = v_dr.client_id),
    'titulo', v_dr.titulo,
    'descricao', v_dr.descricao,
    'categoria', v_dr.categoria,
    'tipo_solicitacao', v_dr.tipo_solicitacao,
    'departamento', v_dr.departamento,
    'urgencia', v_dr.urgencia,
    'status', v_dr.status,
    'competencia', v_dr.competencia,
    'prazo', v_dr.prazo,
    'observacoes_internas', v_dr.observacoes_internas,
    'responsavel_nome', (SELECT p.full_name FROM public.profiles p
                          WHERE p.id = v_dr.responsavel_profile_id),
    'documento_atual', (
      SELECT jsonb_build_object('document_id', d.id, 'nome', d.nome, 'tipo', d.tipo,
                                'competencia', d.competencia, 'data_validade', d.data_validade)
        FROM public.documents d WHERE d.id = v_dr.document_id AND d.deleted_at IS NULL
    ),
    'versoes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'version_number', f.version_number,
               'document_id', f.document_id,
               'document_name', d.nome,
               'submitted_at', f.submitted_at,
               'submitted_by_role', f.submitted_by_role,
               'submission_type', f.submission_type,
               'request_status_at', f.request_status_at,
               'active', f.active
             ) ORDER BY f.version_number DESC), '[]'::jsonb)
        FROM public.document_request_files f
        JOIN public.documents d ON d.id = f.document_id
       WHERE f.document_request_id = v_dr.id
    ),
    'checklist', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', ci.id, 'titulo', ci.titulo, 'categoria', ci.categoria,
               'competencia', ci.competencia, 'status', ci.status,
               'concluded_at', ci.concluded_at)), '[]'::jsonb)
        FROM public.client_checklist_items ci
       WHERE ci.document_request_id = v_dr.id AND ci.deleted_at IS NULL
    ),
    'processo', CASE WHEN v_dr.company_process_id IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
               'process_id', cp.id,
               'tipo', pt.nome,
               'status', cp.status,
               'progresso', cp.progresso,
               'step_id', v_dr.company_process_step_id,
               'requirement_id', v_dr.company_process_step_requirement_id,
               'requisito_atendido', (
                 SELECT r.document_id IS NOT NULL
                   FROM public.company_process_step_requirements r
                  WHERE r.id = v_dr.company_process_step_requirement_id))
        FROM public.company_processes cp
        LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
       WHERE cp.id = v_dr.company_process_id) END,
    'pendencias_associacao', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'issue_type', i.issue_type, 'detalhes', i.detalhes,
               'created_at', i.created_at, 'resolved_at', i.resolved_at)), '[]'::jsonb)
        FROM public.document_request_link_issues i
       WHERE i.document_request_id = v_dr.id
    ),
    'is_demo', v_dr.is_demo,
    'created_at', v_dr.created_at,
    'updated_at', v_dr.updated_at
  ) INTO v_out;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_document_request_details_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_document_request_details_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_document_request_details_staff(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. DETALHE DA SOLICITAÇÃO — CLIENTE (whitelist reduzida)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_document_request_details_client(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dr public.document_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_dr FROM public.document_requests
   WHERE id = _request_id AND deleted_at IS NULL;
  IF v_dr.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_users cu
     WHERE cu.client_id = v_dr.client_id AND cu.user_id = v_uid AND cu.ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'id', v_dr.id,
    'client_id', v_dr.client_id,
    'titulo', v_dr.titulo,
    'descricao', v_dr.descricao,
    'categoria', v_dr.categoria,
    'tipo_solicitacao', v_dr.tipo_solicitacao,
    'departamento', v_dr.departamento,
    'urgencia', v_dr.urgencia,
    'status', v_dr.status,
    'competencia', v_dr.competencia,
    'prazo', v_dr.prazo,
    'possui_anexo', (v_dr.document_id IS NOT NULL),
    'meus_envios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'label', CASE
                          WHEN f.submission_type = 'arquivo_final' THEN 'Arquivo da contabilidade'
                          WHEN f.version_number = 1 THEN 'Primeiro envio'
                          ELSE 'Reenvio ' || (f.version_number - 1)::text END,
               'document_name', d.nome,
               'submitted_at', f.submitted_at,
               'atual', f.active
             ) ORDER BY f.version_number DESC), '[]'::jsonb)
        FROM public.document_request_files f
        JOIN public.documents d ON d.id = f.document_id
       WHERE f.document_request_id = v_dr.id
         AND d.deleted_at IS NULL
         AND (f.submitted_by_role = 'client' OR f.submission_type = 'arquivo_final')
    ),
    'created_at', v_dr.created_at,
    'updated_at', v_dr.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_document_request_details_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_document_request_details_client(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_document_request_details_client(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. ENDURECIMENTO DE PERMISSÕES (funções da Fase 6)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.client_submit_document_request(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_submit_document_request(uuid,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_submit_document_request(uuid,text,text,text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_drf_consistency() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.drf_deactivate_previous() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.drf_block_delete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conclude_checklist_from_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fulfill_requirement_on_conclude() FROM PUBLIC, anon;
