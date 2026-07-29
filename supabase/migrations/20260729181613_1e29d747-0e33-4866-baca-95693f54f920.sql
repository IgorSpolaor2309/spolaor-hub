
CREATE OR REPLACE FUNCTION public.checklist_on_document_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_match_count int;
  v_match_id uuid;
BEGIN
  IF NEW.checklist_item_id IS NOT NULL THEN
    UPDATE public.client_checklist_items ci
       SET status       = 'recebido',
           document_id  = COALESCE(ci.document_id, NEW.id),
           received_at  = COALESCE(ci.received_at, now())
     WHERE ci.id = NEW.checklist_item_id
       AND ci.client_id = NEW.client_id
       AND ci.deleted_at IS NULL
       AND ci.status = 'pendente';

    FOR v_user IN
      SELECT DISTINCT responsavel_profile_id FROM public.client_checklist_items
       WHERE id = NEW.checklist_item_id AND responsavel_profile_id IS NOT NULL
    LOOP
      PERFORM public.notify_user(v_user, 'checklist',
        'Documento recebido — '||public.client_label(NEW.client_id),
        COALESCE(NEW.nome,'Novo arquivo'),'/checklist');
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.competencia IS NOT NULL THEN
    SELECT count(*), (array_agg(ci.id ORDER BY ci.created_at, ci.id))[1]
      INTO v_match_count, v_match_id
      FROM public.client_checklist_items ci
     WHERE ci.client_id = NEW.client_id
       AND ci.status = 'pendente'
       AND ci.deleted_at IS NULL
       AND ci.document_request_id IS NULL
       AND ci.competencia = NEW.competencia;

    IF v_match_count = 1 THEN
      UPDATE public.client_checklist_items ci
         SET status      = 'recebido',
             document_id = COALESCE(ci.document_id, NEW.id),
             received_at = COALESCE(ci.received_at, now())
       WHERE ci.id = v_match_id;

      FOR v_user IN
        SELECT DISTINCT responsavel_profile_id FROM public.client_checklist_items
         WHERE id = v_match_id AND responsavel_profile_id IS NOT NULL
      LOOP
        PERFORM public.notify_user(v_user, 'checklist',
          'Documento recebido — '||public.client_label(NEW.client_id),
          COALESCE(NEW.nome,'Novo arquivo'),'/checklist');
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.client_submit_document_request(
  _request_id uuid,
  _storage_path text,
  _nome text,
  _tipo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.document_requests%ROWTYPE;
  v_doc_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _storage_path IS NULL OR btrim(_storage_path) = '' OR _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Arquivo inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.document_requests WHERE id = _request_id;
  IF v_req.id IS NULL OR v_req.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    EXISTS (SELECT 1 FROM public.client_users cu
             WHERE cu.client_id = v_req.client_id AND cu.user_id = v_uid AND cu.ativo = true)
    OR EXISTS (SELECT 1 FROM public.clients cl
                WHERE cl.id = v_req.client_id AND cl.owner_profile_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para esta solicitação.' USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('aguardando','reenviar') THEN
    RAISE EXCEPTION 'Esta solicitação não aceita envio no momento.' USING ERRCODE = '42501';
  END IF;

  -- o caminho enviado precisa pertencer à pasta da própria empresa
  IF position(v_req.client_id::text || '/' in _storage_path) <> 1 THEN
    RAISE EXCEPTION 'Caminho de arquivo inválido.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.documents (
    client_id, nome, tipo, competencia, storage_path, uploaded_by, status, is_demo, demo_batch_id
  ) VALUES (
    v_req.client_id,
    _nome,
    COALESCE(NULLIF(btrim(COALESCE(_tipo, '')), ''), COALESCE(v_req.tipo_solicitacao, 'outro')),
    v_req.competencia,
    _storage_path,
    v_uid,
    'recebido',
    COALESCE(v_req.is_demo, false),
    v_req.demo_batch_id
  )
  RETURNING id INTO v_doc_id;

  UPDATE public.document_requests
     SET document_id = v_doc_id,
         status      = 'recebido'
   WHERE id = _request_id;

  RETURN v_doc_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.client_submit_document_request(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.client_submit_document_request(uuid, text, text, text) TO authenticated;
