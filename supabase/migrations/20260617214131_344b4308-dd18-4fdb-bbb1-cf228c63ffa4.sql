-- Keep inactive/deleted companies out of non-admin client listings.
DROP POLICY IF EXISTS "Clients: linked read" ON public.clients;
CREATE POLICY "Clients: linked read"
ON public.clients
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND COALESCE(status, 'active') <> 'inactive'
  AND (
    owner_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.client_users cu
      WHERE cu.client_id = clients.id
        AND cu.user_id = auth.uid()
        AND cu.ativo = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = clients.id
        AND c.user_id = auth.uid()
        AND COALESCE(c.status, 'active') = 'active'
    )
  )
);

-- Do not expose collaborator links for inactive/deleted companies to non-admin collaborators.
DROP POLICY IF EXISTS "CC: self read" ON public.client_collaborators;
CREATE POLICY "CC: self read"
ON public.client_collaborators
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.collaborators c
    JOIN public.clients cl ON cl.id = client_collaborators.client_id
    WHERE c.id = client_collaborators.collaborator_id
      AND c.user_id = auth.uid()
      AND COALESCE(c.status, 'active') = 'active'
      AND cl.deleted_at IS NULL
      AND COALESCE(cl.status, 'active') <> 'inactive'
  )
);

-- Staff write policies should respect active client access.
DROP POLICY IF EXISTS "Admin and assigned collab manage doc requests" ON public.document_requests;
CREATE POLICY "Admin and assigned collab manage doc requests"
ON public.document_requests
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id));

DROP POLICY IF EXISTS "Admin and assigned collab update doc requests" ON public.document_requests;
CREATE POLICY "Admin and assigned collab update doc requests"
ON public.document_requests
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id))
WITH CHECK (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id));

DROP POLICY IF EXISTS "Admin and assigned collab insert guides" ON public.tax_guides;
CREATE POLICY "Admin and assigned collab insert guides"
ON public.tax_guides
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id));

DROP POLICY IF EXISTS "Admin and assigned collab update guides" ON public.tax_guides;
CREATE POLICY "Admin and assigned collab update guides"
ON public.tax_guides
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id))
WITH CHECK (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id));

DROP POLICY IF EXISTS "Tasks: admin/collab update" ON public.pending_tasks;
CREATE POLICY "Tasks: admin/collab update"
ON public.pending_tasks
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id))
WITH CHECK (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id));

DROP POLICY IF EXISTS "Docs: admin/collab update" ON public.documents;
CREATE POLICY "Docs: admin/collab update"
ON public.documents
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id))
WITH CHECK (public.is_admin(auth.uid()) OR public.user_has_client_access(auth.uid(), client_id));

-- Clients with active client_users links can send requested documents and guide proofs.
DROP POLICY IF EXISTS "Client may mark request as sent" ON public.document_requests;
CREATE POLICY "Client may mark request as sent"
ON public.document_requests
FOR UPDATE
TO authenticated
USING (
  NOT public.is_admin(auth.uid())
  AND public.user_has_client_access(auth.uid(), client_id)
)
WITH CHECK (
  NOT public.is_admin(auth.uid())
  AND public.user_has_client_access(auth.uid(), client_id)
  AND status = ANY (ARRAY['enviado pelo cliente'::text, 'reenviar'::text])
);

DROP POLICY IF EXISTS "Client may attach payment proof" ON public.tax_guides;
CREATE POLICY "Client may attach payment proof"
ON public.tax_guides
FOR UPDATE
TO authenticated
USING (
  NOT public.is_admin(auth.uid())
  AND public.user_has_client_access(auth.uid(), client_id)
)
WITH CHECK (
  NOT public.is_admin(auth.uid())
  AND public.user_has_client_access(auth.uid(), client_id)
  AND status = 'paga'::text
);

-- Keep notification targets tied to active companies/collaborators.
CREATE OR REPLACE FUNCTION public.client_staff_user_ids(_client_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT u FROM (
    SELECT user_id AS u FROM public.user_roles WHERE role = 'admin'
    UNION
    SELECT c.user_id
      FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      JOIN public.clients cl ON cl.id = cc.client_id
     WHERE cc.client_id = _client_id
       AND c.user_id IS NOT NULL
       AND COALESCE(c.status, 'active') = 'active'
       AND cl.deleted_at IS NULL
       AND COALESCE(cl.status,'active') <> 'inactive'
  ) s WHERE u IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.on_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link text;
  v_user uuid;
  v_preview text;
  v_empresa text;
BEGIN
  UPDATE public.chat_conversations
    SET last_message_at = NEW.created_at, updated_at = now()
    WHERE id = NEW.conversation_id;

  v_empresa := public.client_label(NEW.client_id);
  v_link    := '/interacoes?conversation=' || NEW.conversation_id::text;
  v_preview := CASE
    WHEN NULLIF(btrim(COALESCE(NEW.body, '')), '') IS NOT NULL THEN LEFT(btrim(NEW.body), 160)
    WHEN NULLIF(btrim(COALESCE(NEW.attachment_name, '')), '') IS NOT NULL THEN '📎 ' || btrim(NEW.attachment_name)
    WHEN NEW.attachment_path IS NOT NULL THEN '📎 anexo'
    ELSE '(mensagem)'
  END;

  IF NEW.sender_role IN ('admin','collaborator') THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      IF v_user <> COALESCE(NEW.sender_profile_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(v_user, 'chat',
          'Nova mensagem da equipe — ' || v_empresa, v_preview, v_link);
      END IF;
    END LOOP;
  ELSIF NEW.sender_role = 'client' THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      IF v_user <> COALESCE(NEW.sender_profile_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(v_user, 'chat',
          'Nova mensagem do cliente — ' || v_empresa, v_preview, v_link);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.on_tax_guide_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_empresa text;
  v_msg text;
BEGIN
  v_empresa := public.client_label(NEW.client_id);
  v_msg := COALESCE(NULLIF(NEW.tipo,''),'Guia')
    || COALESCE(' · competência ' || NULLIF(NEW.competencia,''), '')
    || COALESCE(' · vencimento ' || to_char(NEW.vencimento,'DD/MM/YYYY'), '')
    || CASE WHEN NEW.valor IS NOT NULL THEN ' · R$ ' || to_char(NEW.valor, 'FM999G999G999D00') ELSE '' END;

  IF TG_OP = 'INSERT' THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'guia', 'Nova guia disponível — ' || v_empresa, v_msg, '/guias');
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.comprovante_path IS NOT NULL
     AND COALESCE(OLD.comprovante_path,'') = '' THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'guia', 'Comprovante recebido — ' || v_empresa,
        COALESCE(NULLIF(NEW.tipo,''),'Guia') || ' · cliente enviou o comprovante.', '/guias');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.on_document_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_link text;
  v_empresa text;
  v_msg text;
BEGIN
  v_link    := '/solicitacoes';
  v_empresa := public.client_label(NEW.client_id);
  v_msg := COALESCE(NULLIF(NEW.titulo,''), NULLIF(NEW.categoria,''), 'Documento solicitado')
    || COALESCE(' · competência ' || NULLIF(NEW.competencia,''), '')
    || COALESCE(' · prazo ' || to_char(NEW.prazo,'DD/MM/YYYY'), '');

  IF TG_OP = 'INSERT' THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'solicitacao', 'Documento solicitado — ' || v_empresa, v_msg, v_link);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status = 'reenviar' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento precisa ser reenviado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status IN ('enviado pelo cliente','em análise')
       AND OLD.status NOT IN ('enviado pelo cliente','em análise') THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento enviado pelo cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;