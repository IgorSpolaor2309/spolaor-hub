CREATE OR REPLACE FUNCTION public.on_document_insert_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_is_client boolean;
  v_empresa text;
  v_staff_link text;
BEGIN
  v_empresa := public.client_label(NEW.client_id);
  -- "uploaded_by" é cliente se aparece em client_users ou no campo legado owner_profile_id
  v_is_client := EXISTS (
    SELECT 1 FROM public.clients
     WHERE id = NEW.client_id AND owner_profile_id = NEW.uploaded_by
  ) OR EXISTS (
    SELECT 1 FROM public.client_users
     WHERE client_id = NEW.client_id AND user_id = NEW.uploaded_by AND ativo = true
  );

  -- Documento avulso tem item_kind = 'document' e não aparece na aba "recebidos"
  -- (que exige item_kind = 'document_request'); usa-se a visão "todos" filtrada
  -- pela empresa, onde o registro é efetivamente listado.
  v_staff_link := '/documentos?tab=todos&client=' || NEW.client_id::text;

  IF v_is_client THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'documento',
        'Documento enviado pelo cliente — ' || v_empresa,
        COALESCE(NEW.nome, 'Novo arquivo disponível.'),
        v_staff_link);
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.on_document_request_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_empresa text;
  v_msg text;
  v_comp text;
  v_owner text;
  v_link text;
BEGIN
  v_empresa := public.client_label(NEW.client_id);
  v_msg := COALESCE(NULLIF(NEW.titulo,''), NULLIF(NEW.tipo_solicitacao,''), NULLIF(NEW.categoria,''), 'Solicitação')
    || COALESCE(' · ' || NULLIF(NEW.departamento,''), '')
    || COALESCE(' · urgência ' || NULLIF(NEW.urgencia,''), '')
    || COALESCE(' · prazo ' || to_char(NEW.prazo,'DD/MM/YYYY'), '');

  -- comp só entra quando existe de fato (nunca 'comp=' vazio ou 'comp=null')
  v_comp := CASE WHEN NULLIF(btrim(COALESCE(NEW.competencia,'')), '') IS NULL
                 THEN '' ELSE '&comp=' || btrim(NEW.competencia) END;

  -- action_owner derivado exatamente como nas RPCs de listagem
  v_owner := CASE
    WHEN NEW.status IN ('concluido','cancelado') THEN 'none'
    WHEN NEW.status = 'recebido' THEN 'staff'
    WHEN NEW.status = 'reenviar' THEN 'client'
    WHEN NEW.status = 'aguardando' THEN
      CASE
        WHEN NEW.criado_por_role = 'client' THEN 'staff'
        WHEN NEW.criado_por_role = 'staff'  THEN 'client'
        ELSE CASE
          WHEN NEW.criado_por IS NOT NULL AND public.has_role(NEW.criado_por, 'client'::app_role) THEN 'staff'
          ELSE 'client'
        END
      END
    ELSE 'none'
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.criado_por_role = 'client' THEN
      -- aguardando + action_owner=staff não pertence a nenhuma aba específica:
      -- a aba "aguardando_cliente" exige action_owner='client'. Usa-se "todos".
      v_link := '/documentos?tab=todos&client=' || NEW.client_id::text || v_comp;
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Nova solicitação do cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSE
      v_link := '/meus-documentos?section=precisa_enviar&client=' || NEW.client_id::text
        || '&item=' || NEW.id::text || v_comp;
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento solicitado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'reenviar' THEN
      v_link := '/meus-documentos?section=precisa_enviar&client=' || NEW.client_id::text
        || '&item=' || NEW.id::text || v_comp;
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento precisa ser reenviado — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'recebido' THEN
      v_link := '/documentos?tab=recebidos&client=' || NEW.client_id::text || v_comp;
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Documento enviado pelo cliente — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'aguardando' THEN
      -- só cai em "precisa_enviar" quando a ação é realmente do cliente;
      -- caso contrário abre o Portal no item, sem seção inválida.
      v_link := CASE WHEN v_owner = 'client'
        THEN '/meus-documentos?section=precisa_enviar&client=' || NEW.client_id::text
             || '&item=' || NEW.id::text || v_comp
        ELSE '/meus-documentos?client=' || NEW.client_id::text
             || '&item=' || NEW.id::text || v_comp
      END;
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Aguardando sua resposta — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'concluido' THEN
      v_link := '/meus-documentos?section=historico&client=' || NEW.client_id::text
        || '&item=' || NEW.id::text || v_comp;
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao', 'Solicitação concluída — ' || v_empresa, v_msg, v_link);
      END LOOP;
    ELSIF NEW.status = 'cancelado' THEN
      IF NEW.criado_por_role = 'client' THEN
        -- não existe aba de cancelados no staff: "todos" é a visão que os lista.
        v_link := '/documentos?tab=todos&client=' || NEW.client_id::text || v_comp;
        FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
          PERFORM public.notify_user(v_user, 'solicitacao', 'Cliente cancelou a solicitação — ' || v_empresa, v_msg, v_link);
        END LOOP;
      ELSE
        v_link := '/meus-documentos?section=historico&client=' || NEW.client_id::text
          || '&item=' || NEW.id::text || v_comp;
        FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
          PERFORM public.notify_user(v_user, 'solicitacao', 'Solicitação cancelada — ' || v_empresa, v_msg, v_link);
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.attachment_final_path IS NOT NULL
     AND COALESCE(OLD.attachment_final_path,'') = '' THEN
    -- histórico cobre recebido/concluido/cancelado; nos demais status o item
    -- ainda está em "precisa_enviar" (ou sem seção quando a ação é da equipe).
    v_link := CASE
      WHEN NEW.status IN ('recebido','concluido','cancelado')
        THEN '/meus-documentos?section=historico&client=' || NEW.client_id::text
             || '&item=' || NEW.id::text || v_comp
      WHEN v_owner = 'client'
        THEN '/meus-documentos?section=precisa_enviar&client=' || NEW.client_id::text
             || '&item=' || NEW.id::text || v_comp
      ELSE '/meus-documentos?client=' || NEW.client_id::text
           || '&item=' || NEW.id::text || v_comp
    END;
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'solicitacao', 'Arquivo disponível — ' || v_empresa,
        COALESCE(NEW.attachment_final_name, 'Arquivo entregue pela contabilidade.'), v_link);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;