
-- =====================================================================
-- Fase 1: fix_documents_requests_security_and_cross_client_links
-- Idempotente. Não altera dados; só policies, RPCs e triggers.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) document_requests: remover branch de client_users da policy SELECT.
--    Clientes passam a ler exclusivamente via RPC SECURITY DEFINER.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "View doc requests if has client access" ON public.document_requests;

CREATE POLICY "View doc requests staff only"
ON public.document_requests
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR (
    EXISTS (
      SELECT 1
      FROM client_collaborators cc
      JOIN collaborators c ON c.id = cc.collaborator_id
      JOIN clients cl ON cl.id = cc.client_id
      WHERE cc.client_id = document_requests.client_id
        AND c.user_id = auth.uid()
        AND COALESCE(c.status, 'active') = 'active'
        AND cl.deleted_at IS NULL
        AND COALESCE(cl.status, 'active') <> 'inactive'
    )
    AND (
      document_requests.responsavel_profile_id IS NULL
      OR document_requests.responsavel_profile_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM clients cl
    WHERE cl.id = document_requests.client_id
      AND cl.owner_profile_id = auth.uid()
      AND cl.deleted_at IS NULL
      AND COALESCE(cl.status, 'active') <> 'inactive'
  )
);

-- ---------------------------------------------------------------------
-- 2) client_checklist_items: remover leitura direta por cliente.
--    Clientes leem via RPC. Staff mantém leitura direta.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "ccl: select staff acesso" ON public.client_checklist_items;

CREATE POLICY "ccl: select staff only"
ON public.client_checklist_items
FOR SELECT
TO authenticated
USING (
  user_has_client_access(auth.uid(), client_id)
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'collaborator'::app_role))
);

-- ---------------------------------------------------------------------
-- 3) RPC: client_list_document_requests
--    Whitelist explícita de colunas; sem campos internos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_list_document_requests(
  p_client_id uuid,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  titulo text,
  descricao text,
  categoria text,
  tipo_solicitacao text,
  departamento text,
  urgencia text,
  competencia text,
  prazo date,
  status text,
  document_id uuid,
  attachment_final_name text,
  possui_anexo boolean,
  company_process_id uuid,
  company_process_step_id uuid,
  company_process_step_requirement_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_users cu
    JOIN public.clients cl ON cl.id = cu.client_id
    WHERE cu.user_id = auth.uid()
      AND cu.client_id = p_client_id
      AND cu.ativo = true
      AND cl.deleted_at IS NULL
      AND COALESCE(cl.status, 'active') <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    dr.id,
    dr.client_id,
    dr.titulo,
    dr.descricao,
    dr.categoria,
    dr.tipo_solicitacao,
    dr.departamento,
    dr.urgencia,
    dr.competencia,
    dr.prazo,
    dr.status,
    dr.document_id,
    dr.attachment_final_name,
    (dr.document_id IS NOT NULL OR dr.attachment_final_name IS NOT NULL) AS possui_anexo,
    dr.company_process_id,
    dr.company_process_step_id,
    dr.company_process_step_requirement_id,
    dr.created_at,
    dr.updated_at
  FROM public.document_requests dr
  WHERE dr.client_id = p_client_id
    AND dr.deleted_at IS NULL
    AND (p_status IS NULL OR dr.status = p_status)
  ORDER BY dr.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200))
  OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE ALL ON FUNCTION public.client_list_document_requests(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_list_document_requests(uuid, text, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) RPC: client_get_document_request
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_get_document_request(p_id uuid)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  titulo text,
  descricao text,
  categoria text,
  tipo_solicitacao text,
  departamento text,
  urgencia text,
  competencia text,
  prazo date,
  status text,
  document_id uuid,
  attachment_final_name text,
  possui_anexo boolean,
  company_process_id uuid,
  company_process_step_id uuid,
  company_process_step_requirement_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT dr.client_id INTO v_client FROM public.document_requests dr
   WHERE dr.id = p_id AND dr.deleted_at IS NULL;
  IF v_client IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_users cu
    JOIN public.clients cl ON cl.id = cu.client_id
    WHERE cu.user_id = auth.uid()
      AND cu.client_id = v_client
      AND cu.ativo = true
      AND cl.deleted_at IS NULL
      AND COALESCE(cl.status, 'active') <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    dr.id, dr.client_id, dr.titulo, dr.descricao, dr.categoria, dr.tipo_solicitacao,
    dr.departamento, dr.urgencia, dr.competencia, dr.prazo, dr.status, dr.document_id,
    dr.attachment_final_name,
    (dr.document_id IS NOT NULL OR dr.attachment_final_name IS NOT NULL),
    dr.company_process_id, dr.company_process_step_id, dr.company_process_step_requirement_id,
    dr.created_at, dr.updated_at
  FROM public.document_requests dr
  WHERE dr.id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_document_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_document_request(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC: client_get_checklist_items
--    observacao só é retornada quando visivel_cliente = true.
--    Retorna apenas linhas visíveis ao cliente.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_get_checklist_items(
  p_client_id uuid,
  p_competence text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  titulo text,
  categoria text,
  competencia text,
  prazo date,
  status text,
  origem text,
  document_id uuid,
  document_request_id uuid,
  observacao text,
  visivel_cliente boolean,
  received_at timestamptz,
  concluded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_users cu
    JOIN public.clients cl ON cl.id = cu.client_id
    WHERE cu.user_id = auth.uid()
      AND cu.client_id = p_client_id
      AND cu.ativo = true
      AND cl.deleted_at IS NULL
      AND COALESCE(cl.status, 'active') <> 'inactive'
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ci.id, ci.client_id, ci.titulo, ci.categoria, ci.competencia, ci.prazo, ci.status,
    ci.origem, ci.document_id, ci.document_request_id,
    CASE WHEN ci.visivel_cliente = true THEN ci.observacao ELSE NULL END AS observacao,
    ci.visivel_cliente,
    ci.received_at, ci.concluded_at, ci.created_at, ci.updated_at
  FROM public.client_checklist_items ci
  WHERE ci.client_id = p_client_id
    AND ci.deleted_at IS NULL
    AND ci.visivel_cliente = true
    AND (p_competence IS NULL OR ci.competencia = p_competence)
  ORDER BY ci.prazo NULLS LAST, ci.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.client_get_checklist_items(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_checklist_items(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Trigger: company_process_documents cross-client + real/demo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_cpd_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proc_client uuid; v_proc_demo boolean; v_proc_batch uuid;
  v_doc_client uuid;  v_doc_demo boolean;  v_doc_batch uuid;
  v_step_proc uuid;
BEGIN
  SELECT cp.client_id, cp.is_demo, cp.demo_batch_id
    INTO v_proc_client, v_proc_demo, v_proc_batch
    FROM public.company_processes cp WHERE cp.id = NEW.company_process_id;

  IF v_proc_client IS NULL THEN
    RAISE EXCEPTION 'company_process_documents: processo inexistente';
  END IF;

  SELECT d.client_id, d.is_demo, d.demo_batch_id
    INTO v_doc_client, v_doc_demo, v_doc_batch
    FROM public.documents d WHERE d.id = NEW.document_id;

  IF v_doc_client IS NULL THEN
    RAISE EXCEPTION 'company_process_documents: documento inexistente';
  END IF;

  IF v_doc_client <> v_proc_client THEN
    RAISE EXCEPTION 'company_process_documents: cross-client link bloqueado (doc %, processo %)', v_doc_client, v_proc_client
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_doc_demo, false) <> COALESCE(v_proc_demo, false) THEN
    RAISE EXCEPTION 'company_process_documents: mistura real/demo bloqueada'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_proc_demo, false) = true
     AND v_doc_batch IS DISTINCT FROM v_proc_batch THEN
    RAISE EXCEPTION 'company_process_documents: demo_batch_id divergente'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.company_process_step_id IS NOT NULL THEN
    SELECT s.company_process_id INTO v_step_proc
      FROM public.company_process_steps s WHERE s.id = NEW.company_process_step_id;
    IF v_step_proc IS DISTINCT FROM NEW.company_process_id THEN
      RAISE EXCEPTION 'company_process_documents: etapa não pertence ao processo'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpd_consistency ON public.company_process_documents;
CREATE TRIGGER trg_cpd_consistency
BEFORE INSERT OR UPDATE OF document_id, company_process_id, company_process_step_id
ON public.company_process_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_cpd_consistency();

-- ---------------------------------------------------------------------
-- 7) Trigger: company_process_step_requirements.document_id consistência
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_cpsr_document_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proc_client uuid; v_proc_demo boolean; v_proc_batch uuid;
  v_doc_client uuid;  v_doc_demo boolean;  v_doc_batch uuid;
BEGIN
  IF NEW.document_id IS NULL THEN RETURN NEW; END IF;

  SELECT cp.client_id, cp.is_demo, cp.demo_batch_id
    INTO v_proc_client, v_proc_demo, v_proc_batch
    FROM public.company_process_steps s
    JOIN public.company_processes cp ON cp.id = s.company_process_id
    WHERE s.id = NEW.company_process_step_id;

  IF v_proc_client IS NULL THEN
    RAISE EXCEPTION 'cpsr: etapa/processo inexistente';
  END IF;

  SELECT d.client_id, d.is_demo, d.demo_batch_id
    INTO v_doc_client, v_doc_demo, v_doc_batch
    FROM public.documents d WHERE d.id = NEW.document_id;

  IF v_doc_client IS NULL THEN
    RAISE EXCEPTION 'cpsr: documento inexistente';
  END IF;

  IF v_doc_client <> v_proc_client THEN
    RAISE EXCEPTION 'cpsr: cross-client link bloqueado'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_doc_demo, false) <> COALESCE(v_proc_demo, false) THEN
    RAISE EXCEPTION 'cpsr: mistura real/demo bloqueada'
      USING ERRCODE = '23514';
  END IF;

  IF COALESCE(v_proc_demo, false) = true
     AND v_doc_batch IS DISTINCT FROM v_proc_batch THEN
    RAISE EXCEPTION 'cpsr: demo_batch_id divergente'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpsr_document_consistency ON public.company_process_step_requirements;
CREATE TRIGGER trg_cpsr_document_consistency
BEFORE INSERT OR UPDATE OF document_id
ON public.company_process_step_requirements
FOR EACH ROW EXECUTE FUNCTION public.enforce_cpsr_document_consistency();

-- ---------------------------------------------------------------------
-- 8) Trigger: document_requests vínculos válidos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_document_requests_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cp_client uuid; v_cp_demo boolean; v_cp_batch uuid;
  v_step_proc uuid;
  v_req_step uuid;
  v_doc_client uuid; v_doc_demo boolean;
BEGIN
  IF NEW.company_process_id IS NOT NULL THEN
    SELECT cp.client_id, cp.is_demo, cp.demo_batch_id
      INTO v_cp_client, v_cp_demo, v_cp_batch
      FROM public.company_processes cp WHERE cp.id = NEW.company_process_id;
    IF v_cp_client IS NULL THEN
      RAISE EXCEPTION 'document_requests: processo inexistente';
    END IF;
    IF v_cp_client <> NEW.client_id THEN
      RAISE EXCEPTION 'document_requests: processo pertence a outra empresa' USING ERRCODE='23514';
    END IF;
    IF COALESCE(v_cp_demo,false) <> COALESCE(NEW.is_demo,false) THEN
      RAISE EXCEPTION 'document_requests: mistura real/demo com processo' USING ERRCODE='23514';
    END IF;
    IF COALESCE(NEW.is_demo,false) = true AND NEW.demo_batch_id IS DISTINCT FROM v_cp_batch THEN
      RAISE EXCEPTION 'document_requests: demo_batch_id divergente do processo' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.company_process_step_id IS NOT NULL THEN
    SELECT s.company_process_id INTO v_step_proc
      FROM public.company_process_steps s WHERE s.id = NEW.company_process_step_id;
    IF v_step_proc IS NULL THEN
      RAISE EXCEPTION 'document_requests: etapa inexistente';
    END IF;
    IF NEW.company_process_id IS NOT NULL AND v_step_proc <> NEW.company_process_id THEN
      RAISE EXCEPTION 'document_requests: etapa não pertence ao processo' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.company_process_step_requirement_id IS NOT NULL THEN
    SELECT r.company_process_step_id INTO v_req_step
      FROM public.company_process_step_requirements r
      WHERE r.id = NEW.company_process_step_requirement_id;
    IF v_req_step IS NULL THEN
      RAISE EXCEPTION 'document_requests: requisito inexistente';
    END IF;
    IF NEW.company_process_step_id IS NOT NULL AND v_req_step <> NEW.company_process_step_id THEN
      RAISE EXCEPTION 'document_requests: requisito não pertence à etapa' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.document_id IS NOT NULL THEN
    SELECT d.client_id, d.is_demo INTO v_doc_client, v_doc_demo
      FROM public.documents d WHERE d.id = NEW.document_id;
    IF v_doc_client IS NULL THEN
      RAISE EXCEPTION 'document_requests: documento inexistente';
    END IF;
    IF v_doc_client <> NEW.client_id THEN
      RAISE EXCEPTION 'document_requests: documento pertence a outra empresa' USING ERRCODE='23514';
    END IF;
    IF COALESCE(v_doc_demo,false) <> COALESCE(NEW.is_demo,false) THEN
      RAISE EXCEPTION 'document_requests: mistura real/demo com documento' USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dr_consistency ON public.document_requests;
CREATE TRIGGER trg_dr_consistency
BEFORE INSERT OR UPDATE OF client_id, company_process_id, company_process_step_id, company_process_step_requirement_id, document_id, is_demo, demo_batch_id
ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_requests_consistency();

-- ---------------------------------------------------------------------
-- 9) documents: hard delete restrito ao admin e sem vínculos ativos.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Docs: uploader delete" ON public.documents;

CREATE POLICY "Docs: admin delete only"
ON public.documents
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_documents_no_active_links_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.document_requests dr
    WHERE dr.document_id = OLD.id AND dr.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'documents: exclusão bloqueada — vinculado a solicitação ativa. Use soft delete.'
      USING ERRCODE='23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_process_documents cpd
    WHERE cpd.document_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'documents: exclusão bloqueada — vinculado a processo ativo. Use soft delete.'
      USING ERRCODE='23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_process_step_requirements r
    WHERE r.document_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'documents: exclusão bloqueada — vinculado a requisito ativo. Use soft delete.'
      USING ERRCODE='23503';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_checklist_items ci
    WHERE ci.document_id = OLD.id AND ci.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'documents: exclusão bloqueada — vinculado a item de checklist ativo. Use soft delete.'
      USING ERRCODE='23503';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_block_hard_delete ON public.documents;
CREATE TRIGGER trg_documents_block_hard_delete
BEFORE DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_documents_no_active_links_on_delete();
