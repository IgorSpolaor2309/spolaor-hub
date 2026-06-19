
-- 1) Soft-delete columns
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_by_role text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted_by_role text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

ALTER TABLE public.tax_guides
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_role text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_role text,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

CREATE INDEX IF NOT EXISTS tax_guides_deleted_at_idx        ON public.tax_guides (deleted_at);
CREATE INDEX IF NOT EXISTS document_requests_deleted_at_idx ON public.document_requests (deleted_at);

-- 2) Audit + permission trigger for soft delete
CREATE OR REPLACE FUNCTION public.audit_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_just_deleted boolean := (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL);
  v_orig_author uuid;
  v_title text;
  v_action text;
  v_allowed boolean := false;
BEGIN
  IF NOT v_just_deleted THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;

  IF public.is_admin(v_uid) THEN v_role := 'admin';
  ELSIF public.has_role(v_uid, 'collaborator') THEN v_role := 'collaborator';
  ELSE v_role := 'client';
  END IF;

  IF TG_TABLE_NAME = 'documents' THEN
    v_orig_author := OLD.uploaded_by;
    v_title       := OLD.nome;
    v_action      := 'document_deleted';
    v_allowed     := (v_role = 'admin') OR (OLD.uploaded_by = v_uid);
  ELSIF TG_TABLE_NAME = 'chat_messages' THEN
    v_orig_author := OLD.sender_profile_id;
    v_title       := COALESCE(LEFT(OLD.body,120), OLD.attachment_name, '(mensagem)');
    v_action      := 'chat_message_deleted';
    v_allowed     := (v_role = 'admin') OR (OLD.sender_profile_id = v_uid);
  ELSIF TG_TABLE_NAME = 'tax_guides' THEN
    v_orig_author := OLD.created_by;
    v_title       := COALESCE(OLD.tipo,'Guia') || COALESCE(' · ' || NULLIF(OLD.competencia,''),'');
    v_action      := 'tax_guide_deleted';
    v_allowed     := (v_role = 'admin') OR (OLD.created_by = v_uid);
  ELSIF TG_TABLE_NAME = 'document_requests' THEN
    v_orig_author := OLD.responsavel_profile_id;
    v_title       := OLD.titulo;
    v_action      := 'document_request_deleted';
    v_allowed     := (v_role IN ('admin','collaborator'));
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Sem permissão para excluir este item.' USING ERRCODE = '42501';
  END IF;

  NEW.deleted_by      := COALESCE(NEW.deleted_by, v_uid);
  NEW.deleted_by_role := COALESCE(NEW.deleted_by_role, v_role);

  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  VALUES (
    NEW.client_id, v_uid, v_action,
    'Item excluído: ' || COALESCE(v_title, '(sem título)'),
    jsonb_build_object(
      'entity_type',        TG_TABLE_NAME,
      'entity_id',          NEW.id,
      'entity_title',       v_title,
      'original_author_id', v_orig_author,
      'deleted_by_role',    v_role,
      'deletion_reason',    NEW.deletion_reason,
      'admin_override',     (v_role = 'admin' AND v_orig_author IS NOT NULL AND v_orig_author <> v_uid)
    )
  );

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_audit_soft_delete ON public.documents;
CREATE TRIGGER trg_audit_soft_delete BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

DROP TRIGGER IF EXISTS trg_audit_soft_delete ON public.chat_messages;
CREATE TRIGGER trg_audit_soft_delete BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

DROP TRIGGER IF EXISTS trg_audit_soft_delete ON public.tax_guides;
CREATE TRIGGER trg_audit_soft_delete BEFORE UPDATE ON public.tax_guides
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

DROP TRIGGER IF EXISTS trg_audit_soft_delete ON public.document_requests;
CREATE TRIGGER trg_audit_soft_delete BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_soft_delete();

-- 3) Allow admin to soft-delete chat messages (existing policy only allowed sender)
DROP POLICY IF EXISTS "Chat msg: admin update" ON public.chat_messages;
CREATE POLICY "Chat msg: admin update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
