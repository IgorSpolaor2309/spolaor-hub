
CREATE OR REPLACE FUNCTION public.enforce_document_requests_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF NEW.client_id        IS DISTINCT FROM OLD.client_id        OR
     NEW.titulo           IS DISTINCT FROM OLD.titulo           OR
     NEW.categoria        IS DISTINCT FROM OLD.categoria        OR
     NEW.descricao        IS DISTINCT FROM OLD.descricao        OR
     NEW.prazo            IS DISTINCT FROM OLD.prazo            OR
     NEW.competencia      IS DISTINCT FROM OLD.competencia      OR
     NEW.responsavel_profile_id IS DISTINCT FROM OLD.responsavel_profile_id OR
     NEW.observacoes_internas   IS DISTINCT FROM OLD.observacoes_internas   OR
     NEW.omie_documento_id      IS DISTINCT FROM OLD.omie_documento_id      OR
     NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Clientes só podem alterar o status desta solicitação.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_tax_guides_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF NEW.client_id            IS DISTINCT FROM OLD.client_id            OR
     NEW.tipo                 IS DISTINCT FROM OLD.tipo                 OR
     NEW.competencia          IS DISTINCT FROM OLD.competencia          OR
     NEW.vencimento           IS DISTINCT FROM OLD.vencimento           OR
     NEW.valor                IS DISTINCT FROM OLD.valor                OR
     NEW.observacoes_internas IS DISTINCT FROM OLD.observacoes_internas OR
     NEW.omie_titulo_id       IS DISTINCT FROM OLD.omie_titulo_id       OR
     NEW.created_at           IS DISTINCT FROM OLD.created_at           OR
     NEW.created_by           IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'Clientes só podem anexar o comprovante e marcar como paga.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
