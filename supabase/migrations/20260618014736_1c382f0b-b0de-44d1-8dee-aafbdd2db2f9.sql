
-- 1) documents: só o uploader pode mexer em deleted_at/deleted_by
CREATE OR REPLACE FUNCTION public.enforce_documents_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     OR (NEW.deleted_by IS DISTINCT FROM OLD.deleted_by) THEN
    IF OLD.uploaded_by IS NULL OR OLD.uploaded_by <> auth.uid() THEN
      RAISE EXCEPTION 'Somente o autor do envio pode remover este documento.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  -- uploaded_by é imutável
  IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by THEN
    NEW.uploaded_by := OLD.uploaded_by;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_documents_soft_delete ON public.documents;
CREATE TRIGGER trg_documents_soft_delete
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_documents_soft_delete();

-- 2) tax_guides: só quem enviou o comprovante pode limpá-lo
CREATE OR REPLACE FUNCTION public.enforce_tax_guides_proof_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_proof_changed boolean := (NEW.comprovante_path IS DISTINCT FROM OLD.comprovante_path)
    OR (NEW.comprovante_uploaded_by IS DISTINCT FROM OLD.comprovante_uploaded_by);
BEGIN
  IF v_proof_changed
     AND OLD.comprovante_path IS NOT NULL
     AND (NEW.comprovante_path IS NULL OR NEW.comprovante_path <> OLD.comprovante_path) THEN
    -- removeu ou substituiu um comprovante já existente
    IF OLD.comprovante_uploaded_by IS NULL OR OLD.comprovante_uploaded_by <> auth.uid() THEN
      RAISE EXCEPTION 'Somente o autor do envio do comprovante pode removê-lo.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tax_guides_proof_owner ON public.tax_guides;
CREATE TRIGGER trg_tax_guides_proof_owner
BEFORE UPDATE ON public.tax_guides
FOR EACH ROW EXECUTE FUNCTION public.enforce_tax_guides_proof_owner();

-- 3) chat_messages: a policy UPDATE já restringe ao sender; trigger garante
--    que ele só consiga limpar/marcar deleted_at, deleted_by, body, attachment_*.
CREATE OR REPLACE FUNCTION public.enforce_chat_message_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.conversation_id  IS DISTINCT FROM OLD.conversation_id
  OR NEW.client_id        IS DISTINCT FROM OLD.client_id
  OR NEW.sender_profile_id IS DISTINCT FROM OLD.sender_profile_id
  OR NEW.sender_role      IS DISTINCT FROM OLD.sender_role
  OR NEW.created_at       IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos protegidos da mensagem não podem ser alterados.'
      USING ERRCODE = '42501';
  END IF;
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
     OR (NEW.deleted_by IS DISTINCT FROM OLD.deleted_by) THEN
    IF OLD.sender_profile_id IS NULL OR OLD.sender_profile_id <> auth.uid() THEN
      RAISE EXCEPTION 'Somente o autor da mensagem pode marcá-la como removida.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_messages_update ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_update
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_message_update();
