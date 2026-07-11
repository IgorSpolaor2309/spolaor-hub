
-- ============================================================
-- Fase 3 (Bloco 1): Integração Processos ↔ Documentos
-- ============================================================

-- 1) REQUISITOS DOCUMENTAIS NO MODELO (por etapa do process_type)
CREATE TABLE IF NOT EXISTS public.process_step_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_step_id uuid NOT NULL REFERENCES public.process_steps(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  observacao text,
  obrigatorio boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_step_requirements TO authenticated;
GRANT ALL ON public.process_step_requirements TO service_role;
ALTER TABLE public.process_step_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psr read staff" ON public.process_step_requirements FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'));
CREATE POLICY "psr write staff" ON public.process_step_requirements FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'));
CREATE INDEX IF NOT EXISTS idx_psr_step ON public.process_step_requirements(process_step_id, ordem);
CREATE TRIGGER trg_psr_updated BEFORE UPDATE ON public.process_step_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) REQUISITOS INSTANCIADOS POR ETAPA DE PROCESSO
CREATE TABLE IF NOT EXISTS public.company_process_step_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_process_step_id uuid NOT NULL REFERENCES public.company_process_steps(id) ON DELETE CASCADE,
  source_requirement_id uuid REFERENCES public.process_step_requirements(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  observacao text,
  obrigatorio boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  fulfilled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_process_step_requirements TO authenticated;
GRANT ALL ON public.company_process_step_requirements TO service_role;
ALTER TABLE public.company_process_step_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpsr read staff" ON public.company_process_step_requirements FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'));
CREATE POLICY "cpsr write staff" ON public.company_process_step_requirements FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'));
CREATE INDEX IF NOT EXISTS idx_cpsr_step ON public.company_process_step_requirements(company_process_step_id, ordem);
CREATE INDEX IF NOT EXISTS idx_cpsr_document ON public.company_process_step_requirements(document_id);
CREATE TRIGGER trg_cpsr_updated BEFORE UPDATE ON public.company_process_step_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) VÍNCULOS GERAIS DE DOCUMENTOS AO PROCESSO / ETAPA (sem requisito)
CREATE TABLE IF NOT EXISTS public.company_process_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_process_id uuid NOT NULL REFERENCES public.company_processes(id) ON DELETE CASCADE,
  company_process_step_id uuid REFERENCES public.company_process_steps(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  observacao text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_process_documents TO authenticated;
GRANT ALL ON public.company_process_documents TO service_role;
ALTER TABLE public.company_process_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cpd read staff" ON public.company_process_documents FOR SELECT
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'));
CREATE POLICY "cpd write staff" ON public.company_process_documents FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'collaborator'));
CREATE INDEX IF NOT EXISTS idx_cpd_process ON public.company_process_documents(company_process_id);
CREATE INDEX IF NOT EXISTS idx_cpd_step ON public.company_process_documents(company_process_step_id);
CREATE INDEX IF NOT EXISTS idx_cpd_document ON public.company_process_documents(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpd_link ON public.company_process_documents(
  company_process_id,
  COALESCE(company_process_step_id, '00000000-0000-0000-0000-000000000000'::uuid),
  document_id
);

-- ============================================================
-- Validações no banco (mesma empresa, doc não excluído)
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_process_document_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_proc_client uuid; v_doc_client uuid; v_doc_deleted timestamptz; v_step_proc uuid;
BEGIN
  SELECT client_id INTO v_proc_client FROM public.company_processes WHERE id = NEW.company_process_id;
  SELECT client_id, deleted_at INTO v_doc_client, v_doc_deleted FROM public.documents WHERE id = NEW.document_id;
  IF v_doc_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Documento excluído não pode ser vinculado.' USING ERRCODE='22023';
  END IF;
  IF v_proc_client IS NULL OR v_doc_client IS NULL OR v_proc_client <> v_doc_client THEN
    RAISE EXCEPTION 'Documento deve pertencer à mesma empresa do processo.' USING ERRCODE='22023';
  END IF;
  IF NEW.company_process_step_id IS NOT NULL THEN
    SELECT company_process_id INTO v_step_proc FROM public.company_process_steps WHERE id = NEW.company_process_step_id;
    IF v_step_proc IS DISTINCT FROM NEW.company_process_id THEN
      RAISE EXCEPTION 'Etapa não pertence ao processo informado.' USING ERRCODE='22023';
    END IF;
  END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_cpd_validate BEFORE INSERT OR UPDATE ON public.company_process_documents
  FOR EACH ROW EXECUTE FUNCTION public.validate_process_document_link();

CREATE OR REPLACE FUNCTION public.validate_requirement_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_step_proc uuid; v_proc_client uuid; v_doc_client uuid; v_doc_deleted timestamptz;
BEGIN
  IF NEW.document_id IS NOT NULL THEN
    SELECT cps.company_process_id, cp.client_id INTO v_step_proc, v_proc_client
      FROM public.company_process_steps cps
      JOIN public.company_processes cp ON cp.id = cps.company_process_id
     WHERE cps.id = NEW.company_process_step_id;
    SELECT client_id, deleted_at INTO v_doc_client, v_doc_deleted FROM public.documents WHERE id = NEW.document_id;
    IF v_doc_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'Documento excluído não pode atender requisito.' USING ERRCODE='22023';
    END IF;
    IF v_proc_client IS NULL OR v_doc_client IS NULL OR v_proc_client <> v_doc_client THEN
      RAISE EXCEPTION 'Documento deve pertencer à mesma empresa do processo.' USING ERRCODE='22023';
    END IF;
    IF NEW.fulfilled_at IS NULL THEN NEW.fulfilled_at := now(); END IF;
    IF NEW.fulfilled_by IS NULL THEN NEW.fulfilled_by := auth.uid(); END IF;
  ELSE
    NEW.fulfilled_at := NULL; NEW.fulfilled_by := NULL;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_cpsr_validate BEFORE INSERT OR UPDATE ON public.company_process_step_requirements
  FOR EACH ROW EXECUTE FUNCTION public.validate_requirement_document();

-- ============================================================
-- Timeline events
-- ============================================================

CREATE OR REPLACE FUNCTION public.tg_cpd_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_client uuid; v_doc_name text; v_role text := public.current_actor_role();
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT client_id INTO v_client FROM public.company_processes WHERE id = NEW.company_process_id;
    SELECT nome INTO v_doc_name FROM public.documents WHERE id = NEW.document_id;
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (v_client, auth.uid(),
      CASE WHEN NEW.company_process_step_id IS NOT NULL
           THEN 'processo_etapa_documento_vinculado'
           ELSE 'processo_documento_vinculado' END,
      'Documento vinculado: '||COALESCE(v_doc_name,'—'),
      jsonb_build_object('process_id', NEW.company_process_id, 'step_id', NEW.company_process_step_id,
        'document_id', NEW.document_id, 'link_id', NEW.id, 'origem_ator', v_role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT client_id INTO v_client FROM public.company_processes WHERE id = OLD.company_process_id;
    SELECT nome INTO v_doc_name FROM public.documents WHERE id = OLD.document_id;
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (v_client, auth.uid(), 'processo_documento_desvinculado',
      'Vínculo removido: '||COALESCE(v_doc_name,'—'),
      jsonb_build_object('process_id', OLD.company_process_id, 'step_id', OLD.company_process_step_id,
        'document_id', OLD.document_id, 'origem_ator', v_role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_cpd_timeline AFTER INSERT OR DELETE ON public.company_process_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_cpd_timeline();

CREATE OR REPLACE FUNCTION public.tg_cpsr_timeline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_client uuid; v_role text := public.current_actor_role();
        v_doc_new text; v_doc_old text; v_proc uuid;
BEGIN
  SELECT cp.client_id, cps.company_process_id INTO v_client, v_proc
    FROM public.company_process_steps cps
    JOIN public.company_processes cp ON cp.id = cps.company_process_id
   WHERE cps.id = COALESCE(NEW.company_process_step_id, OLD.company_process_step_id);

  IF TG_OP = 'UPDATE' AND NEW.document_id IS DISTINCT FROM OLD.document_id THEN
    IF OLD.document_id IS NOT NULL THEN SELECT nome INTO v_doc_old FROM public.documents WHERE id = OLD.document_id; END IF;
    IF NEW.document_id IS NOT NULL THEN SELECT nome INTO v_doc_new FROM public.documents WHERE id = NEW.document_id; END IF;
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (v_client, auth.uid(),
      CASE WHEN OLD.document_id IS NULL THEN 'processo_requisito_atendido'
           WHEN NEW.document_id IS NULL THEN 'processo_requisito_removido'
           ELSE 'processo_requisito_substituido' END,
      'Requisito "'||NEW.nome||'": '||
        CASE WHEN OLD.document_id IS NULL THEN 'atendido com '||COALESCE(v_doc_new,'documento')
             WHEN NEW.document_id IS NULL THEN 'atendimento removido ('||COALESCE(v_doc_old,'documento')||')'
             ELSE 'substituído ('||COALESCE(v_doc_old,'—')||' → '||COALESCE(v_doc_new,'—')||')' END,
      jsonb_build_object('process_id', v_proc, 'step_id', NEW.company_process_step_id,
        'requirement_id', NEW.id, 'old_document_id', OLD.document_id, 'new_document_id', NEW.document_id,
        'origem_ator', v_role));
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_cpsr_timeline AFTER UPDATE ON public.company_process_step_requirements
  FOR EACH ROW EXECUTE FUNCTION public.tg_cpsr_timeline();

-- ============================================================
-- Atualizar open_company_process para copiar requisitos
-- ============================================================

CREATE OR REPLACE FUNCTION public.open_company_process(
  _client_id uuid, _process_type_id uuid, _responsavel_id uuid DEFAULT NULL,
  _prazo_final date DEFAULT NULL, _prioridade text DEFAULT 'media', _observacoes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _new_id uuid; _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.company_processes
    (client_id, process_type_id, responsavel_id, prazo_final, prioridade, observacoes, created_by)
  VALUES
    (_client_id, _process_type_id, _responsavel_id, _prazo_final,
     COALESCE(_prioridade,'media'), _observacoes, auth.uid())
  RETURNING id INTO _new_id;

  WITH inserted_steps AS (
    INSERT INTO public.company_process_steps (
      company_process_id, process_step_id, nome, descricao, ordem, departamento,
      obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
      responsavel_id, prazo, prazo_tipo, prazo_dias
    )
    SELECT _new_id, s.id, s.nome, s.descricao, s.ordem, s.departamento,
           s.obrigatoria, s.exige_documento, s.visivel_cliente, s.pode_concluir_manual,
           COALESCE(_responsavel_id, s.responsavel_padrao_id),
           CASE WHEN s.prazo_tipo='abertura' AND s.prazo_dias IS NOT NULL
                THEN (_hoje + (s.prazo_dias||' days')::interval)::date ELSE NULL END,
           s.prazo_tipo, s.prazo_dias
      FROM public.process_steps s
     WHERE s.process_type_id = _process_type_id
     ORDER BY s.ordem, s.created_at
    RETURNING id, process_step_id
  )
  INSERT INTO public.company_process_step_requirements
    (company_process_step_id, source_requirement_id, nome, descricao, observacao, obrigatorio, ordem)
  SELECT ins.id, r.id, r.nome, r.descricao, r.observacao, r.obrigatorio, r.ordem
    FROM inserted_steps ins
    JOIN public.process_step_requirements r ON r.process_step_id = ins.process_step_id
   ORDER BY r.ordem;

  RETURN _new_id;
END; $$;
