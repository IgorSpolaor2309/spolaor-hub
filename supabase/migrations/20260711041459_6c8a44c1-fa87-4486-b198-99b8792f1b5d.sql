
-- Fase 3 · Bloco 2: Integração Processos ↔ Solicitações de documentos

-- 1) Novos campos em document_requests para vincular ao processo/etapa/requisito
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS company_process_id uuid REFERENCES public.company_processes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_process_step_id uuid REFERENCES public.company_process_steps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_process_step_requirement_id uuid REFERENCES public.company_process_step_requirements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_dr_company_process
  ON public.document_requests(company_process_id) WHERE company_process_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_dr_company_process_step
  ON public.document_requests(company_process_step_id) WHERE company_process_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_dr_requirement
  ON public.document_requests(company_process_step_requirement_id) WHERE company_process_step_requirement_id IS NOT NULL;

-- Uma solicitação ativa por requisito (statuses ativos = não cancelado/concluido/recebido)
CREATE UNIQUE INDEX IF NOT EXISTS uq_dr_active_per_requirement
  ON public.document_requests(company_process_step_requirement_id)
  WHERE company_process_step_requirement_id IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('cancelado','concluido','recebido');

-- 2) Validação de coerência (empresa, etapa/processo, requisito/etapa)
CREATE OR REPLACE FUNCTION public.validate_document_request_process_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proc_client uuid;
  v_step_process uuid;
  v_step_client uuid;
  v_req_step uuid;
BEGIN
  IF NEW.company_process_id IS NOT NULL THEN
    SELECT client_id INTO v_proc_client FROM public.company_processes WHERE id = NEW.company_process_id;
    IF v_proc_client IS NULL THEN
      RAISE EXCEPTION 'Processo não encontrado' USING ERRCODE='23503';
    END IF;
    IF v_proc_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Empresa da solicitação difere do processo' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.company_process_step_id IS NOT NULL THEN
    SELECT cps.company_process_id, cp.client_id
      INTO v_step_process, v_step_client
      FROM public.company_process_steps cps
      JOIN public.company_processes cp ON cp.id = cps.company_process_id
     WHERE cps.id = NEW.company_process_step_id;
    IF v_step_process IS NULL THEN
      RAISE EXCEPTION 'Etapa não encontrada' USING ERRCODE='23503';
    END IF;
    IF NEW.company_process_id IS NULL THEN
      NEW.company_process_id := v_step_process;
    ELSIF NEW.company_process_id <> v_step_process THEN
      RAISE EXCEPTION 'Etapa pertence a outro processo' USING ERRCODE='23514';
    END IF;
    IF v_step_client <> NEW.client_id THEN
      RAISE EXCEPTION 'Empresa da solicitação difere da etapa' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.company_process_step_requirement_id IS NOT NULL THEN
    SELECT company_process_step_id INTO v_req_step
      FROM public.company_process_step_requirements
     WHERE id = NEW.company_process_step_requirement_id;
    IF v_req_step IS NULL THEN
      RAISE EXCEPTION 'Requisito não encontrado' USING ERRCODE='23503';
    END IF;
    IF NEW.company_process_step_id IS NULL THEN
      NEW.company_process_step_id := v_req_step;
      -- reprocessar coerência de processo/cliente
      SELECT cps.company_process_id, cp.client_id
        INTO v_step_process, v_step_client
        FROM public.company_process_steps cps
        JOIN public.company_processes cp ON cp.id = cps.company_process_id
       WHERE cps.id = v_req_step;
      IF NEW.company_process_id IS NULL THEN NEW.company_process_id := v_step_process; END IF;
      IF v_step_client <> NEW.client_id THEN
        RAISE EXCEPTION 'Empresa da solicitação difere do requisito' USING ERRCODE='23514';
      END IF;
    ELSIF v_req_step <> NEW.company_process_step_id THEN
      RAISE EXCEPTION 'Requisito pertence a outra etapa' USING ERRCODE='23514';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_dr_process_link ON public.document_requests;
CREATE TRIGGER trg_validate_dr_process_link
  BEFORE INSERT OR UPDATE OF client_id, company_process_id, company_process_step_id, company_process_step_requirement_id
  ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_document_request_process_link();

-- 3) Ao receber documento em uma solicitação vinculada, preencher requisito automaticamente
CREATE OR REPLACE FUNCTION public.fulfill_requirement_from_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req record;
  v_step_process uuid;
  v_client uuid;
  v_conflict boolean := false;
BEGIN
  IF NEW.company_process_step_requirement_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.document_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.document_id IS NOT DISTINCT FROM NEW.document_id THEN RETURN NEW; END IF;

  SELECT r.*, cps.company_process_id, cp.client_id
    INTO v_req
    FROM public.company_process_step_requirements r
    JOIN public.company_process_steps cps ON cps.id = r.company_process_step_id
    JOIN public.company_processes cp ON cp.id = cps.company_process_id
   WHERE r.id = NEW.company_process_step_requirement_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Conflito: já atendido por outro documento
  IF v_req.document_id IS NOT NULL AND v_req.document_id <> NEW.document_id THEN
    v_conflict := true;
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (v_req.client_id, auth.uid(), 'processo_requisito_conflito',
      'Cliente enviou documento para requisito já atendido — vínculo NÃO substituído automaticamente.',
      jsonb_build_object(
        'process_id', v_req.company_process_id,
        'step_id', v_req.company_process_step_id,
        'requirement_id', v_req.id,
        'requirement_nome', v_req.nome,
        'request_id', NEW.id,
        'existing_document_id', v_req.document_id,
        'new_document_id', NEW.document_id));
    RETURN NEW;
  END IF;

  -- Sem conflito: atender requisito
  IF v_req.document_id IS NULL THEN
    UPDATE public.company_process_step_requirements
       SET document_id = NEW.document_id,
           fulfilled_by = COALESCE(auth.uid(), NEW.criado_por),
           fulfilled_at = now()
     WHERE id = v_req.id;

    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (v_req.client_id, auth.uid(), 'processo_requisito_atendido_solicitacao',
      'Requisito "'||v_req.nome||'" atendido pelo envio da solicitação.',
      jsonb_build_object(
        'process_id', v_req.company_process_id,
        'step_id', v_req.company_process_step_id,
        'requirement_id', v_req.id,
        'request_id', NEW.id,
        'document_id', NEW.document_id));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dr_fulfill_requirement ON public.document_requests;
CREATE TRIGGER trg_dr_fulfill_requirement
  AFTER UPDATE OF document_id ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.fulfill_requirement_from_request();

-- 4) Timeline: quando solicitação é criada já vinculada a um processo, marcar com tipo específico
CREATE OR REPLACE FUNCTION public.log_document_request_process_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_req_nome text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_process_id IS NOT NULL THEN
      SELECT nome INTO v_req_nome FROM public.company_process_step_requirements WHERE id = NEW.company_process_step_requirement_id;
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, auth.uid(), 'processo_solicitacao_criada',
        'Solicitação vinculada ao processo'||COALESCE(' · requisito "'||v_req_nome||'"',''),
        jsonb_build_object(
          'process_id', NEW.company_process_id,
          'step_id', NEW.company_process_step_id,
          'requirement_id', NEW.company_process_step_requirement_id,
          'request_id', NEW.id,
          'titulo', NEW.titulo));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status = 'cancelado'
       AND NEW.company_process_id IS NOT NULL THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, auth.uid(), 'processo_solicitacao_cancelada',
        'Solicitação vinculada ao processo cancelada',
        jsonb_build_object(
          'process_id', NEW.company_process_id,
          'step_id', NEW.company_process_step_id,
          'requirement_id', NEW.company_process_step_requirement_id,
          'request_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dr_process_link_log ON public.document_requests;
CREATE TRIGGER trg_dr_process_link_log
  AFTER INSERT OR UPDATE OF status ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_document_request_process_link();
