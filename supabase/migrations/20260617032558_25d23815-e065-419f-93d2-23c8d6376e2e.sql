
CREATE OR REPLACE FUNCTION public.admin_create_client_with_user(
  _payload jsonb,
  _user_id uuid,
  _papel text DEFAULT 'responsavel'::text,
  _collaborator_ids uuid[] DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_exists boolean;
  v_collab uuid;
  v_valid_count int;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem criar clientes' USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório vincular uma conta de usuário existente' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Conta de usuário não encontrada' USING ERRCODE = '22023';
  END IF;

  IF _collaborator_ids IS NULL OR array_length(_collaborator_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'É obrigatório vincular pelo menos um colaborador encarregado' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_valid_count
    FROM public.collaborators
   WHERE id = ANY(_collaborator_ids);
  IF v_valid_count <> array_length(_collaborator_ids, 1) THEN
    RAISE EXCEPTION 'Um ou mais colaboradores selecionados não existem' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.clients (
    razao_social, nome_fantasia, cnpj, documento, email, telefone, tipo, observacoes,
    situacao_cadastral, data_abertura, cnae_principal_codigo, cnae_principal_descricao,
    cep, logradouro, numero, complemento, bairro, cidade, uf,
    porte, natureza_juridica, capital_social, simples_nacional, mei,
    qsa_json, dados_receita_json, ultima_consulta_receita,
    origem_cadastro, owner_profile_id, status
  )
  VALUES (
    COALESCE(_payload->>'razao_social',''),
    NULLIF(_payload->>'nome_fantasia',''),
    NULLIF(_payload->>'cnpj',''),
    NULLIF(_payload->>'documento',''),
    NULLIF(_payload->>'email',''),
    NULLIF(_payload->>'telefone',''),
    NULLIF(_payload->>'tipo',''),
    NULLIF(_payload->>'observacoes',''),
    NULLIF(_payload->>'situacao_cadastral',''),
    NULLIF(_payload->>'data_abertura','')::date,
    NULLIF(_payload->>'cnae_principal_codigo',''),
    NULLIF(_payload->>'cnae_principal_descricao',''),
    NULLIF(_payload->>'cep',''),
    NULLIF(_payload->>'logradouro',''),
    NULLIF(_payload->>'numero',''),
    NULLIF(_payload->>'complemento',''),
    NULLIF(_payload->>'bairro',''),
    NULLIF(_payload->>'cidade',''),
    NULLIF(_payload->>'uf',''),
    NULLIF(_payload->>'porte',''),
    NULLIF(_payload->>'natureza_juridica',''),
    NULLIF(_payload->>'capital_social','')::numeric,
    CASE WHEN _payload ? 'simples_nacional' AND _payload->>'simples_nacional' IS NOT NULL
         THEN (_payload->>'simples_nacional')::boolean END,
    CASE WHEN _payload ? 'mei' AND _payload->>'mei' IS NOT NULL
         THEN (_payload->>'mei')::boolean END,
    CASE WHEN _payload ? 'qsa_json' THEN _payload->'qsa_json' END,
    CASE WHEN _payload ? 'dados_receita_json' THEN _payload->'dados_receita_json' END,
    NULLIF(_payload->>'ultima_consulta_receita','')::timestamptz,
    COALESCE(NULLIF(_payload->>'origem_cadastro',''),'manual'),
    _user_id,
    COALESCE(NULLIF(_payload->>'status',''),'active')
  )
  RETURNING id INTO v_client_id;

  INSERT INTO public.client_users (client_id, user_id, papel, ativo, criado_por)
  VALUES (v_client_id, _user_id, COALESCE(NULLIF(_papel,''),'responsavel'), true, auth.uid())
  ON CONFLICT DO NOTHING;

  FOREACH v_collab IN ARRAY _collaborator_ids LOOP
    INSERT INTO public.client_collaborators (client_id, collaborator_id)
    VALUES (v_client_id, v_collab)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_client_id;
END;
$function$;
