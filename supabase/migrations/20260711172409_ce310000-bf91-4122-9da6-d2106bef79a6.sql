
-- 1) Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.tg_demo_batches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END
$function$;

-- 2) Restrict what a chat message sender may modify on UPDATE
CREATE OR REPLACE FUNCTION public.tg_chat_messages_restrict_sender_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can update anything
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-admin senders may not change immutable identity/routing fields
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.client_id       IS DISTINCT FROM OLD.client_id
     OR NEW.sender_profile_id IS DISTINCT FROM OLD.sender_profile_id
     OR NEW.sender_role     IS DISTINCT FROM OLD.sender_role
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Não é permitido alterar identidade ou roteamento da mensagem';
  END IF;

  -- Non-admin senders may not forge deletion authorship / role
  IF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    IF NEW.deleted_by IS NOT NULL AND NEW.deleted_by <> auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido atribuir a exclusão a outro usuário';
    END IF;
  END IF;

  IF NEW.deleted_by_role IS DISTINCT FROM OLD.deleted_by_role THEN
    -- Force deleted_by_role to match the sender's own role
    IF NEW.deleted_by_role IS NOT NULL AND NEW.deleted_by_role <> OLD.sender_role THEN
      RAISE EXCEPTION 'Não é permitido atribuir a exclusão a outro papel';
    END IF;
  END IF;

  -- If marking as deleted, force deleted_by = auth.uid() and role = sender_role
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    NEW.deleted_by := auth.uid();
    NEW.deleted_by_role := OLD.sender_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_restrict_sender_update ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_restrict_sender_update
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_chat_messages_restrict_sender_update();

-- 3) Tighten "Client may update own request" to real client accounts only
DROP POLICY IF EXISTS "Client may update own request" ON public.document_requests;
CREATE POLICY "Client may update own request"
ON public.document_requests
FOR UPDATE
USING (
  (NOT public.is_admin(auth.uid()))
  AND public.has_role(auth.uid(), 'client'::app_role)
  AND public.user_has_client_access(auth.uid(), client_id)
)
WITH CHECK (
  (NOT public.is_admin(auth.uid()))
  AND public.has_role(auth.uid(), 'client'::app_role)
  AND public.user_has_client_access(auth.uid(), client_id)
  AND (status = ANY (ARRAY[
    'enviado pelo cliente'::text,
    'reenviar'::text,
    'solicitado'::text,
    'em_andamento'::text,
    'aguardando_cliente'::text,
    'cancelado'::text,
    'concluido'::text,
    'recebido'::text
  ]))
);
