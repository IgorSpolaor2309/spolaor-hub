-- Normalize document_requests status values:
-- "enviado pelo cliente" and "em análise" → "aguardando_analise"
UPDATE public.document_requests
   SET status = 'aguardando_analise'
 WHERE status IN ('enviado pelo cliente', 'em análise');

-- "aprovado" historical → "recebido" (unified label)
UPDATE public.document_requests
   SET status = 'recebido'
 WHERE status = 'aprovado';

-- Update notification trigger to use the new status value
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
    ELSIF NEW.status = 'aguardando_analise'
       AND OLD.status NOT IN ('aguardando_analise') THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento enviado pelo cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;