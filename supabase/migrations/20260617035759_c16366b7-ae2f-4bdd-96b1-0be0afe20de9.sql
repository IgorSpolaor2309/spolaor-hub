
-- document_requests: bloquear alteração de campos internos por clientes
CREATE OR REPLACE FUNCTION public.enforce_document_requests_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
BEGIN
  v_is_staff := public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1
    FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = NEW.client_id AND c.user_id = auth.uid()
  );
  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  -- Cliente só pode mudar status; demais colunas devem permanecer iguais
  IF NEW.client_id        IS DISTINCT FROM OLD.client_id        OR
     NEW.titulo           IS DISTINCT FROM OLD.titulo           OR
     NEW.categoria        IS DISTINCT FROM OLD.categoria        OR
     NEW.descricao        IS DISTINCT FROM OLD.descricao        OR
     NEW.prazo            IS DISTINCT FROM OLD.prazo            OR
     NEW.competencia      IS DISTINCT FROM OLD.competencia      OR
     NEW.responsavel_profile_id IS DISTINCT FROM OLD.responsavel_profile_id OR
     NEW.observacoes_internas   IS DISTINCT FROM OLD.observacoes_internas   OR
     NEW.omie_documento_id      IS DISTINCT FROM OLD.omie_documento_id      OR
     NEW.created_at       IS DISTINCT FROM OLD.created_at       OR
     NEW.criado_por       IS DISTINCT FROM OLD.criado_por
  THEN
    RAISE EXCEPTION 'Clientes só podem alterar o status desta solicitação.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_requests_client_update ON public.document_requests;
CREATE TRIGGER trg_document_requests_client_update
BEFORE UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_document_requests_client_update();

-- tax_guides: bloquear alteração de campos sensíveis por clientes
CREATE OR REPLACE FUNCTION public.enforce_tax_guides_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_staff boolean;
BEGIN
  v_is_staff := public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1
    FROM public.client_collaborators cc
    JOIN public.collaborators c ON c.id = cc.collaborator_id
    WHERE cc.client_id = NEW.client_id AND c.user_id = auth.uid()
  );
  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  -- Cliente só pode alterar status, comprovante_path e comprovante_uploaded_at
  IF NEW.client_id            IS DISTINCT FROM OLD.client_id            OR
     NEW.tipo                 IS DISTINCT FROM OLD.tipo                 OR
     NEW.competencia          IS DISTINCT FROM OLD.competencia          OR
     NEW.vencimento           IS DISTINCT FROM OLD.vencimento           OR
     NEW.valor                IS DISTINCT FROM OLD.valor                OR
     NEW.observacoes_internas IS DISTINCT FROM OLD.observacoes_internas OR
     NEW.omie_titulo_id       IS DISTINCT FROM OLD.omie_titulo_id       OR
     NEW.created_at           IS DISTINCT FROM OLD.created_at           OR
     NEW.criado_por           IS DISTINCT FROM OLD.criado_por
  THEN
    RAISE EXCEPTION 'Clientes só podem anexar o comprovante e marcar como paga.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tax_guides_client_update ON public.tax_guides;
CREATE TRIGGER trg_tax_guides_client_update
BEFORE UPDATE ON public.tax_guides
FOR EACH ROW EXECUTE FUNCTION public.enforce_tax_guides_client_update();
