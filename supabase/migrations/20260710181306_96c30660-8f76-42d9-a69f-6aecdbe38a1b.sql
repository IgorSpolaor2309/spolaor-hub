
-- Checklist do Cliente

CREATE TABLE public.client_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  categoria text NOT NULL DEFAULT 'outro',
  responsavel_profile_id uuid REFERENCES public.profiles(id),
  prazo date,
  competencia text,
  observacao text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','recebido','concluido','cancelado')),
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
  received_at timestamptz,
  concluded_at timestamptz,
  concluded_by uuid REFERENCES public.profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES public.profiles(id),
  deleted_by_role text,
  deletion_reason text
);

CREATE INDEX idx_ccl_client ON public.client_checklist_items(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ccl_status ON public.client_checklist_items(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_ccl_resp ON public.client_checklist_items(responsavel_profile_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_ccl_docreq ON public.client_checklist_items(document_request_id);
CREATE INDEX idx_ccl_client_comp ON public.client_checklist_items(client_id, competencia) WHERE deleted_at IS NULL AND status = 'pendente';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_checklist_items TO authenticated;
GRANT ALL ON public.client_checklist_items TO service_role;

ALTER TABLE public.client_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ccl: select por acesso ao cliente"
  ON public.client_checklist_items FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));

CREATE POLICY "ccl: insert staff com acesso"
  ON public.client_checklist_items FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_client_access(auth.uid(), client_id)
    AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'collaborator'))
  );

CREATE POLICY "ccl: update staff com acesso"
  ON public.client_checklist_items FOR UPDATE TO authenticated
  USING (
    public.user_has_client_access(auth.uid(), client_id)
    AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'collaborator'))
  )
  WITH CHECK (
    public.user_has_client_access(auth.uid(), client_id)
    AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'collaborator'))
  );

CREATE POLICY "ccl: admin delete"
  ON public.client_checklist_items FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_ccl_updated_at
  BEFORE UPDATE ON public.client_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Timeline event on insert / status change
CREATE OR REPLACE FUNCTION public.log_checklist_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'checklist_criado',
      'Checklist: '||NEW.titulo,
      jsonb_build_object('checklist_id', NEW.id, 'categoria', NEW.categoria));
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(),
      'checklist_status',
      'Checklist "'||NEW.titulo||'" → '||NEW.status,
      jsonb_build_object('checklist_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ccl_log
  AFTER INSERT OR UPDATE ON public.client_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.log_checklist_event();

-- Auto-mark "Recebido" quando documento é criado (match client+competencia)
CREATE OR REPLACE FUNCTION public.checklist_on_document_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  UPDATE public.client_checklist_items ci
    SET status = 'recebido',
        document_id = COALESCE(ci.document_id, NEW.id),
        received_at = COALESCE(ci.received_at, now())
   WHERE ci.client_id = NEW.client_id
     AND ci.status = 'pendente'
     AND ci.deleted_at IS NULL
     AND ci.document_request_id IS NULL
     AND NEW.competencia IS NOT NULL
     AND ci.competencia = NEW.competencia;

  -- Notifica responsável
  FOR v_user IN
    SELECT DISTINCT responsavel_profile_id FROM public.client_checklist_items
     WHERE document_id = NEW.id AND responsavel_profile_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(v_user, 'checklist',
      'Documento recebido — '||public.client_label(NEW.client_id),
      COALESCE(NEW.nome,'Novo arquivo'),'/checklist');
  END LOOP;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ccl_doc_insert
  AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.checklist_on_document_insert();

-- Auto-mark "Recebido" quando solicitação vinculada é marcada como recebida
CREATE OR REPLACE FUNCTION public.checklist_on_request_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.status = 'recebido' AND OLD.status <> 'recebido' THEN
    UPDATE public.client_checklist_items ci
      SET status = 'recebido',
          document_id = COALESCE(ci.document_id, NEW.document_id),
          received_at = COALESCE(ci.received_at, now())
     WHERE ci.document_request_id = NEW.id
       AND ci.status = 'pendente'
       AND ci.deleted_at IS NULL;

    FOR v_user IN
      SELECT DISTINCT responsavel_profile_id FROM public.client_checklist_items
       WHERE document_request_id = NEW.id AND responsavel_profile_id IS NOT NULL
    LOOP
      PERFORM public.notify_user(v_user, 'checklist',
        'Documento recebido — '||public.client_label(NEW.client_id),
        COALESCE(NEW.titulo,'Solicitação'),'/checklist');
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ccl_request_update
  AFTER UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.checklist_on_request_update();
