
-- =========================================================
-- 1. CHAT: tabelas, grants, RLS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat conv: read"
  ON public.chat_conversations FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Chat conv: insert"
  ON public.chat_conversations FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Chat conv: update"
  ON public.chat_conversations FOR UPDATE TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id))
  WITH CHECK (public.user_has_client_access(auth.uid(), client_id));

CREATE TRIGGER chat_conversations_set_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sender_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('admin','collaborator','client','system')),
  body text,
  attachment_path text,
  attachment_name text,
  attachment_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON public.chat_messages (conversation_id, created_at);

GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat msg: read"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Chat msg: insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_client_access(auth.uid(), client_id)
    AND sender_profile_id = auth.uid()
  );

-- Realtime
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_conversations REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =========================================================
-- 2. Helpers de notificação
-- =========================================================
CREATE OR REPLACE FUNCTION public.client_staff_user_ids(_client_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u FROM (
    SELECT user_id AS u FROM public.user_roles WHERE role = 'admin'
    UNION
    SELECT c.user_id
      FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
     WHERE cc.client_id = _client_id AND c.user_id IS NOT NULL
  ) s WHERE u IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid, _tipo text, _titulo text, _mensagem text, _link text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, link, lida)
  VALUES (_user_id, _tipo, _titulo, _mensagem, _link, false);
END; $$;

-- =========================================================
-- 3. Trigger: chat_messages -> atualizar conversa + notificar
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_owner uuid;
  v_link text;
  v_user uuid;
  v_preview text;
BEGIN
  UPDATE public.chat_conversations
    SET last_message_at = NEW.created_at, updated_at = now()
    WHERE id = NEW.conversation_id;

  v_link := '/interacoes?conversation=' || NEW.conversation_id::text;
  v_preview := COALESCE(LEFT(NEW.body, 120),
                        CASE WHEN NEW.attachment_path IS NOT NULL
                             THEN '📎 ' || COALESCE(NEW.attachment_name,'anexo') END,
                        '(mensagem)');

  IF NEW.sender_role IN ('admin','collaborator') THEN
    SELECT owner_profile_id INTO v_client_owner FROM public.clients WHERE id = NEW.client_id;
    PERFORM public.notify_user(v_client_owner, 'chat',
      'Nova mensagem da equipe', v_preview, v_link);
  ELSIF NEW.sender_role = 'client' THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      IF v_user <> COALESCE(NEW.sender_profile_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(v_user, 'chat',
          'Nova mensagem do cliente', v_preview, v_link);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER chat_messages_after_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_insert();

-- =========================================================
-- 4. Trigger: document_requests -> notificar
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_document_request_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_user uuid;
  v_link text;
BEGIN
  v_link := '/solicitacoes';
  IF TG_OP = 'INSERT' THEN
    SELECT owner_profile_id INTO v_owner FROM public.clients WHERE id = NEW.client_id;
    PERFORM public.notify_user(v_owner, 'solicitacao',
      'Novo documento solicitado',
      COALESCE(NEW.titulo, NEW.categoria, 'Documento solicitado'), v_link);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status = 'reenviar' THEN
      SELECT owner_profile_id INTO v_owner FROM public.clients WHERE id = NEW.client_id;
      PERFORM public.notify_user(v_owner, 'solicitacao',
        'Documento precisa ser reenviado',
        COALESCE(NEW.titulo, 'A equipe pediu o reenvio de um documento.'), v_link);
    ELSIF NEW.status IN ('enviado pelo cliente','em análise') AND OLD.status NOT IN ('enviado pelo cliente','em análise') THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento enviado pelo cliente',
          COALESCE(NEW.titulo, 'Há um documento aguardando análise.'), v_link);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER document_requests_notify_insert
  AFTER INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_document_request_change();
CREATE TRIGGER document_requests_notify_update
  AFTER UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.on_document_request_change();

-- =========================================================
-- 5. Trigger: documents -> notificar equipe quando vier do cliente
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_document_insert_notify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_is_client boolean;
BEGIN
  v_is_client := EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = NEW.client_id AND owner_profile_id = NEW.uploaded_by
  );
  IF v_is_client THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'documento',
        'Documento enviado pelo cliente',
        COALESCE(NEW.nome, 'Novo arquivo disponível.'),
        '/documentos');
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER documents_notify_insert
  AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.on_document_insert_notify();

-- =========================================================
-- 6. Trigger: tax_guides -> notificar
-- =========================================================
CREATE OR REPLACE FUNCTION public.on_tax_guide_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT owner_profile_id INTO v_owner FROM public.clients WHERE id = NEW.client_id;
    PERFORM public.notify_user(v_owner, 'guia',
      'Nova guia disponível',
      COALESCE(NEW.tipo,'Guia') || ' - vencimento ' || COALESCE(to_char(NEW.vencimento,'DD/MM/YYYY'),'—'),
      '/guias');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.comprovante_path IS NOT NULL
     AND COALESCE(OLD.comprovante_path,'') = '' THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'guia',
        'Comprovante de pagamento recebido',
        COALESCE(NEW.tipo,'Guia') || ' - cliente enviou o comprovante.',
        '/guias');
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER tax_guides_notify_insert
  AFTER INSERT ON public.tax_guides
  FOR EACH ROW EXECUTE FUNCTION public.on_tax_guide_change();
CREATE TRIGGER tax_guides_notify_update
  AFTER UPDATE ON public.tax_guides
  FOR EACH ROW EXECUTE FUNCTION public.on_tax_guide_change();

-- =========================================================
-- 7. message_templates: escopo + permissões revisadas
-- =========================================================
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'global'
  CHECK (escopo IN ('global','pessoal'));

DROP POLICY IF EXISTS "Staff can view templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins manage templates insert" ON public.message_templates;
DROP POLICY IF EXISTS "Admins manage templates update" ON public.message_templates;
DROP POLICY IF EXISTS "Admins manage templates delete" ON public.message_templates;

CREATE POLICY "Templates: staff read"
  ON public.message_templates FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'collaborator')
      AND (escopo = 'global' OR created_by = auth.uid())
    )
  );

CREATE POLICY "Templates: staff insert"
  ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'collaborator'))
    AND created_by = auth.uid()
    AND (escopo = 'pessoal' OR public.is_admin(auth.uid()))
  );

CREATE POLICY "Templates: update own or admin"
  ON public.message_templates FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (created_by = auth.uid() AND escopo = 'pessoal')
  );

CREATE POLICY "Templates: delete own or admin"
  ON public.message_templates FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR (created_by = auth.uid() AND escopo = 'pessoal'));
