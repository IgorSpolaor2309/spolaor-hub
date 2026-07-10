
-- 1) Novos campos
ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS tipo_solicitacao text,
  ADD COLUMN IF NOT EXISTS departamento text,
  ADD COLUMN IF NOT EXISTS urgencia text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS criado_por uuid,
  ADD COLUMN IF NOT EXISTS criado_por_role text,
  ADD COLUMN IF NOT EXISTS attachment_final_path text,
  ADD COLUMN IF NOT EXISTS attachment_final_name text;

-- 2) Trigger para preencher criado_por/criado_por_role no INSERT
CREATE OR REPLACE FUNCTION public.document_requests_set_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NEW.criado_por IS NULL THEN
    NEW.criado_por := v_uid;
  END IF;
  IF NEW.criado_por_role IS NULL THEN
    IF v_uid IS NULL THEN
      NEW.criado_por_role := 'system';
    ELSIF public.is_admin(v_uid) THEN
      NEW.criado_por_role := 'admin';
    ELSIF public.has_role(v_uid, 'collaborator') THEN
      NEW.criado_por_role := 'collaborator';
    ELSE
      NEW.criado_por_role := 'client';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_requests_set_author ON public.document_requests;
CREATE TRIGGER trg_document_requests_set_author
  BEFORE INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.document_requests_set_author();

-- 3) SELECT policy: colaborador só vê as suas (atribuídas ou sem responsável)
DROP POLICY IF EXISTS "View doc requests if has client access" ON public.document_requests;
CREATE POLICY "View doc requests if has client access"
  ON public.document_requests FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (
      -- Colaborador: precisa ter acesso à empresa E ser responsável (ou item sem responsável)
      EXISTS (
        SELECT 1
        FROM public.client_collaborators cc
        JOIN public.collaborators c ON c.id = cc.collaborator_id
        JOIN public.clients cl ON cl.id = cc.client_id
        WHERE cc.client_id = document_requests.client_id
          AND c.user_id = auth.uid()
          AND COALESCE(c.status,'active') = 'active'
          AND cl.deleted_at IS NULL
          AND COALESCE(cl.status,'active') <> 'inactive'
      )
      AND (responsavel_profile_id IS NULL OR responsavel_profile_id = auth.uid())
    )
    OR (
      -- Cliente: dono legado ou client_users ativo
      EXISTS (
        SELECT 1 FROM public.clients cl
        WHERE cl.id = document_requests.client_id
          AND cl.owner_profile_id = auth.uid()
          AND cl.deleted_at IS NULL
          AND COALESCE(cl.status,'active') <> 'inactive'
      )
      OR EXISTS (
        SELECT 1 FROM public.client_users cu
        JOIN public.clients cl ON cl.id = cu.client_id
        WHERE cu.client_id = document_requests.client_id
          AND cu.user_id = auth.uid()
          AND cu.ativo = true
          AND cl.deleted_at IS NULL
          AND COALESCE(cl.status,'active') <> 'inactive'
      )
    )
  );

-- 4) UPDATE policy do cliente: permitir cancelar/responder além de marcar enviado
DROP POLICY IF EXISTS "Client may mark request as sent" ON public.document_requests;
CREATE POLICY "Client may update own request"
  ON public.document_requests FOR UPDATE TO authenticated
  USING (
    NOT public.is_admin(auth.uid())
    AND public.user_has_client_access(auth.uid(), client_id)
  )
  WITH CHECK (
    NOT public.is_admin(auth.uid())
    AND public.user_has_client_access(auth.uid(), client_id)
    AND status = ANY (ARRAY[
      'enviado pelo cliente','reenviar','solicitado','em_andamento',
      'aguardando_cliente','cancelado','concluido','recebido'
    ])
  );

-- 5) Ajustar enforce trigger para permitir cliente alterar attachment_final quando estiver respondendo
--    (mantém demais campos imutáveis para não-staff)
CREATE OR REPLACE FUNCTION public.enforce_document_requests_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_is_staff boolean;
BEGIN
  v_is_staff := public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1
    FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = NEW.client_id AND c.user_id = auth.uid()
  );
  IF v_is_staff THEN RETURN NEW; END IF;

  IF NEW.client_id                 IS DISTINCT FROM OLD.client_id                 OR
     NEW.titulo                    IS DISTINCT FROM OLD.titulo                    OR
     NEW.categoria                 IS DISTINCT FROM OLD.categoria                 OR
     NEW.tipo_solicitacao          IS DISTINCT FROM OLD.tipo_solicitacao          OR
     NEW.departamento              IS DISTINCT FROM OLD.departamento              OR
     NEW.urgencia                  IS DISTINCT FROM OLD.urgencia                  OR
     NEW.prazo                     IS DISTINCT FROM OLD.prazo                     OR
     NEW.competencia               IS DISTINCT FROM OLD.competencia               OR
     NEW.responsavel_profile_id    IS DISTINCT FROM OLD.responsavel_profile_id    OR
     NEW.observacoes_internas      IS DISTINCT FROM OLD.observacoes_internas      OR
     NEW.omie_documento_id         IS DISTINCT FROM OLD.omie_documento_id         OR
     NEW.criado_por                IS DISTINCT FROM OLD.criado_por                OR
     NEW.criado_por_role           IS DISTINCT FROM OLD.criado_por_role           OR
     NEW.created_at                IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Clientes só podem alterar status, descrição e anexo da resposta.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 6) Notificações: cobrir novo fluxo (criado pelo cliente + status novos)
CREATE OR REPLACE FUNCTION public.on_document_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_link text := '/solicitacoes';
  v_empresa text;
  v_msg text;
BEGIN
  v_empresa := public.client_label(NEW.client_id);
  v_msg := COALESCE(NULLIF(NEW.titulo,''), NULLIF(NEW.tipo_solicitacao,''), NULLIF(NEW.categoria,''), 'Solicitação')
    || COALESCE(' · ' || NULLIF(NEW.departamento,''), '')
    || COALESCE(' · urgência ' || NULLIF(NEW.urgencia,''), '')
    || COALESCE(' · prazo ' || to_char(NEW.prazo,'DD/MM/YYYY'), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW.criado_por_role = 'client' THEN
      -- Cliente criou → notifica equipe
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Nova solicitação do cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSE
      -- Equipe criou → notifica cliente
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento solicitado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'reenviar' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento precisa ser reenviado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status IN ('enviado pelo cliente','em análise','recebido') THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento enviado pelo cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'em_andamento' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Sua solicitação está em andamento — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'aguardando_cliente' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Aguardando sua resposta — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'concluido' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Solicitação concluída — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'cancelado' THEN
      IF NEW.criado_por_role = 'client' THEN
        FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
          PERFORM public.notify_user(v_user, 'solicitacao', 'Cliente cancelou a solicitação — ' || v_empresa, v_msg, v_link);
        END LOOP;
      ELSE
        FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
          PERFORM public.notify_user(v_user, 'solicitacao', 'Solicitação cancelada — ' || v_empresa, v_msg, v_link);
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- Anexo final entregue → notifica cliente
  IF TG_OP = 'UPDATE'
     AND NEW.attachment_final_path IS NOT NULL
     AND COALESCE(OLD.attachment_final_path,'') = '' THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'solicitacao', 'Arquivo disponível — ' || v_empresa,
        COALESCE(NEW.attachment_final_name, 'Arquivo entregue pela contabilidade.'), v_link);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- 7) Timeline events para responsável / anexo final
CREATE OR REPLACE FUNCTION public.log_document_request_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'solicitacao_criada',
      'Solicitação criada: ' || COALESCE(NEW.titulo,'(sem título)'),
      jsonb_build_object('request_id', NEW.id, 'criado_por_role', NEW.criado_por_role,
        'tipo_solicitacao', NEW.tipo_solicitacao, 'departamento', NEW.departamento, 'urgencia', NEW.urgencia));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, auth.uid(), 'solicitacao_status',
        'Solicitação "' || COALESCE(NEW.titulo,'') || '" → ' || NEW.status,
        jsonb_build_object('request_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status));
    END IF;
    IF NEW.responsavel_profile_id IS DISTINCT FROM OLD.responsavel_profile_id THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, auth.uid(), 'solicitacao_responsavel',
        'Responsável alterado para ' || COALESCE(NEW.responsavel_profile_id::text, '—'),
        jsonb_build_object('request_id', NEW.id, 'old', OLD.responsavel_profile_id, 'new', NEW.responsavel_profile_id));
    END IF;
    IF NEW.attachment_final_path IS DISTINCT FROM OLD.attachment_final_path
       AND NEW.attachment_final_path IS NOT NULL THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, auth.uid(), 'solicitacao_anexo_final',
        'Arquivo final anexado: ' || COALESCE(NEW.attachment_final_name, NEW.attachment_final_path),
        jsonb_build_object('request_id', NEW.id));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_requests_timeline ON public.document_requests;
CREATE TRIGGER trg_document_requests_timeline
  AFTER INSERT OR UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_document_request_event();

CREATE INDEX IF NOT EXISTS document_requests_responsavel_idx
  ON public.document_requests (responsavel_profile_id);
CREATE INDEX IF NOT EXISTS document_requests_criado_por_idx
  ON public.document_requests (criado_por);
