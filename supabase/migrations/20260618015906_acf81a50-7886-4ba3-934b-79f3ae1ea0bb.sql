-- 1) Backfill: remover status "aguardando_analise" das solicitações
UPDATE public.document_requests
   SET status = 'recebido'
 WHERE status = 'aguardando_analise';

-- 2) Atualizar trigger de notificação para disparar quando vira "recebido"
--    (cliente envia → vai direto para "recebido")
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
    ELSIF NEW.status = 'recebido'
       AND OLD.status NOT IN ('recebido') THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento recebido — ' || v_empresa,
          'Cliente enviou o documento solicitado: ' || v_msg,
          v_link);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;