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
  v_titulo text;
  v_updated integer;
  v_recipients uuid[];
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

  -- Destinatários resolvidos procedimentalmente: funções SETOF não podem
  -- ser chamadas dentro de CASE/COALESCE ou de qualquer expressão escalar.
  IF NEW.sender_role = 'client' THEN
    v_titulo := 'Nova mensagem do cliente — ' || v_empresa;
    SELECT array_agg(u) INTO v_recipients
      FROM public.client_staff_user_ids(NEW.client_id) AS u;
  ELSIF NEW.sender_role IN ('admin','collaborator') THEN
    v_titulo := 'Nova mensagem da equipe — ' || v_empresa;
    SELECT array_agg(u) INTO v_recipients
      FROM public.client_user_ids(NEW.client_id) AS u;
  ELSE
    RETURN NEW;
  END IF;

  FOREACH v_user IN ARRAY COALESCE(v_recipients, ARRAY[]::uuid[])
  LOOP
    CONTINUE WHEN v_user IS NULL;
    CONTINUE WHEN v_user = COALESCE(NEW.sender_profile_id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Trava por (destinatário, conversa): impede duplicidade sem índice novo.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(v_user::text || ':' || NEW.conversation_id::text, 0)
    );

    UPDATE public.notifications
       SET titulo = v_titulo,
           mensagem = v_preview,
           created_at = NEW.created_at
     WHERE id = (
       SELECT n.id FROM public.notifications n
        WHERE n.user_id = v_user
          AND n.tipo = 'chat'
          AND n.link = v_link
          AND n.lida = false
        ORDER BY n.created_at DESC
        LIMIT 1
     );
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      PERFORM public.notify_user(v_user, 'chat', v_titulo, v_preview, v_link);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;