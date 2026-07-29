CREATE OR REPLACE FUNCTION public.client_open_interaction(
  _client_id uuid,
  _body text DEFAULT NULL,
  _attachment_path text DEFAULT NULL,
  _attachment_name text DEFAULT NULL,
  _attachment_size integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_body text := NULLIF(btrim(COALESCE(_body, '')), '');
  v_att  text := NULLIF(btrim(COALESCE(_attachment_path, '')), '');
  v_att_name text := NULLIF(btrim(COALESCE(_attachment_name, '')), '');
  v_conv_id uuid;
  v_created boolean := false;
  v_msg_id uuid;
  v_dup uuid;
BEGIN
  -- 1. autenticação
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  -- 2. papel CLIENT
  IF NOT public.has_role(v_uid, 'client'::app_role) THEN
    RAISE EXCEPTION 'apenas clientes podem abrir conversa por aqui' USING ERRCODE = '42501';
  END IF;

  -- 3/4. vínculo com a empresa (bloqueia client_id externo)
  IF _client_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.client_user_ids(_client_id) u WHERE u = v_uid) THEN
    RAISE EXCEPTION 'empresa não vinculada à sua conta' USING ERRCODE = '42501';
  END IF;

  -- 10. não criar conversa vazia
  IF v_body IS NULL AND v_att IS NULL THEN
    RAISE EXCEPTION 'informe uma mensagem ou anexe um arquivo' USING ERRCODE = '22023';
  END IF;

  -- 8. anexo só dentro da pasta da própria empresa
  IF v_att IS NOT NULL AND position((_client_id::text || '/chat/') in v_att) <> 1 THEN
    RAISE EXCEPTION 'anexo inválido para esta empresa' USING ERRCODE = '22023';
  END IF;

  -- 6. modelo atual: uma conversa por empresa — localiza ou cria
  SELECT id INTO v_conv_id FROM public.chat_conversations WHERE client_id = _client_id;
  IF v_conv_id IS NULL THEN
    INSERT INTO public.chat_conversations (client_id)
    VALUES (_client_id)
    ON CONFLICT (client_id) DO NOTHING
    RETURNING id INTO v_conv_id;
    IF v_conv_id IS NULL THEN
      SELECT id INTO v_conv_id FROM public.chat_conversations WHERE client_id = _client_id;
    ELSE
      v_created := true;
    END IF;
  END IF;

  -- 9. anti duplo clique: mesma mensagem, mesmo autor, últimos 10s
  SELECT m.id INTO v_dup
    FROM public.chat_messages m
   WHERE m.conversation_id = v_conv_id
     AND m.sender_profile_id = v_uid
     AND m.created_at > now() - interval '10 seconds'
     AND m.deleted_at IS NULL
     AND COALESCE(m.body, '') IS NOT DISTINCT FROM COALESCE(v_body, '')
     AND COALESCE(m.attachment_path, '') IS NOT DISTINCT FROM COALESCE(v_att, '')
   ORDER BY m.created_at DESC
   LIMIT 1;

  IF v_dup IS NOT NULL THEN
    v_msg_id := v_dup;
  ELSE
    -- 7. primeira mensagem (o trigger on_chat_message_insert gera as notificações uma única vez)
    INSERT INTO public.chat_messages (
      conversation_id, client_id, sender_profile_id, sender_role,
      body, attachment_path, attachment_name, attachment_size
    )
    VALUES (
      v_conv_id, _client_id, v_uid, 'client',
      v_body, v_att, CASE WHEN v_att IS NULL THEN NULL ELSE COALESCE(v_att_name, 'anexo') END,
      CASE WHEN v_att IS NULL THEN NULL ELSE _attachment_size END
    )
    RETURNING id INTO v_msg_id;
  END IF;

  -- 10. retorno com campos explícitos (sem storage_path nem metadados internos)
  RETURN jsonb_build_object(
    'conversation_id', v_conv_id,
    'client_id', _client_id,
    'empresa', public.client_label(_client_id),
    'message_id', v_msg_id,
    'conversation_created', v_created,
    'message_deduplicated', (v_dup IS NOT NULL)
  );
END $function$;

REVOKE ALL ON FUNCTION public.client_open_interaction(uuid,text,text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_open_interaction(uuid,text,text,text,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.client_open_interaction(uuid,text,text,text,integer) TO authenticated;