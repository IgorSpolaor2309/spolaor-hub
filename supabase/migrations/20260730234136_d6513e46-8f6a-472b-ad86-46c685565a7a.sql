
-- 1) Elegibilidade canônica para "responsável principal"
CREATE OR REPLACE FUNCTION public.collaborator_primary_eligible(p_client_id uuid, p_collaborator_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.collaborators col
      JOIN public.profiles p ON p.id = col.user_id
      JOIN public.clients c ON c.id = p_client_id
     WHERE col.id = p_collaborator_id
       AND COALESCE(col.status,'active') = 'active'
       AND COALESCE(p.status,'active') = 'active'
       AND COALESCE(p.is_demo,false) = COALESCE(c.is_demo,false)
       AND (NOT COALESCE(c.is_demo,false) OR c.demo_batch_id IS NOT DISTINCT FROM p.demo_batch_id)
       AND EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = p.id AND ur.role IN ('admin','collaborator'))
  )
$$;

REVOKE ALL ON FUNCTION public.collaborator_primary_eligible(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collaborator_primary_eligible(uuid, uuid) TO authenticated, service_role;

-- 2) RPC canônica e transacional de sincronização da carteira + principal
CREATE OR REPLACE FUNCTION public.admin_sync_client_collaborators(
  p_client_id uuid,
  p_collaborator_ids uuid[],
  p_primary_collaborator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client public.clients;
  v_ids uuid[] := COALESCE(p_collaborator_ids, ARRAY[]::uuid[]);
  v_len int := COALESCE(array_length(COALESCE(p_collaborator_ids, ARRAY[]::uuid[]), 1), 0);
  v_primary uuid := p_primary_collaborator_id;
  v_eligible uuid[];
  v_elig_len int;
  v_count int;
  v_client_active boolean;
BEGIN
  IF NOT public._competence_admin_or_service() THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar a carteira de colaboradores.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> v_len THEN
    RAISE EXCEPTION 'Há colaboradores repetidos na seleção.' USING ERRCODE = '22023';
  END IF;

  IF v_len > 0 THEN
    SELECT count(*) INTO v_count
      FROM public.collaborators col
     WHERE col.id = ANY(v_ids)
       AND COALESCE(col.is_demo,false) = COALESCE(v_client.is_demo,false);
    IF v_count <> v_len THEN
      RAISE EXCEPTION 'Um ou mais colaboradores não existem ou pertencem a outro ambiente (Real/Demo).' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(x), ARRAY[]::uuid[]) INTO v_eligible
    FROM unnest(v_ids) x
   WHERE public.collaborator_primary_eligible(p_client_id, x);
  v_elig_len := COALESCE(array_length(v_eligible, 1), 0);

  IF v_primary IS NOT NULL AND NOT (v_primary = ANY(v_ids)) THEN
    RAISE EXCEPTION 'O responsável principal precisa estar entre os colaboradores vinculados.' USING ERRCODE = '22023';
  END IF;

  IF v_primary IS NULL AND v_elig_len = 1 THEN
    v_primary := v_eligible[1];
  END IF;

  IF v_primary IS NOT NULL AND NOT public.collaborator_primary_eligible(p_client_id, v_primary) THEN
    RAISE EXCEPTION 'Este colaborador não pode ser responsável principal: é necessário estar ativo e possuir conta de acesso da equipe.' USING ERRCODE = '22023';
  END IF;

  v_client_active := (COALESCE(v_client.status,'active') = 'active' AND v_client.deleted_at IS NULL);

  IF v_primary IS NULL AND v_client_active THEN
    IF v_elig_len > 1 THEN
      RAISE EXCEPTION 'Selecione qual colaborador será o responsável principal desta empresa.' USING ERRCODE = '22023';
    ELSE
      RAISE EXCEPTION 'Empresa ativa precisa de um responsável principal elegível (colaborador ativo com conta de acesso da equipe).' USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.client_collaborators
   WHERE client_id = p_client_id
     AND NOT (collaborator_id = ANY(v_ids));

  UPDATE public.client_collaborators
     SET is_primary = false
   WHERE client_id = p_client_id
     AND is_primary
     AND (v_primary IS NULL OR collaborator_id <> v_primary);

  IF v_len > 0 THEN
    INSERT INTO public.client_collaborators (client_id, collaborator_id, is_primary, is_demo, demo_batch_id)
    SELECT p_client_id, x, (v_primary IS NOT NULL AND x = v_primary),
           COALESCE(v_client.is_demo,false), v_client.demo_batch_id
      FROM unnest(v_ids) x
    ON CONFLICT (client_id, collaborator_id)
    DO UPDATE SET is_primary = EXCLUDED.is_primary;
  END IF;

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'total', v_len,
    'primary_collaborator_id', v_primary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_client_collaborators(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sync_client_collaborators(uuid, uuid[], uuid) TO authenticated, service_role;

-- 3) Auxiliar para a tela do Colaborador (delegando na regra canônica)
CREATE OR REPLACE FUNCTION public.admin_set_collaborator_client_link(
  p_client_id uuid,
  p_collaborator_id uuid,
  p_link boolean,
  p_replacement_collaborator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ids uuid[];
  v_primary uuid;
BEGIN
  IF NOT public._competence_admin_or_service() THEN
    RAISE EXCEPTION 'Apenas administradores podem gerenciar a carteira de colaboradores.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.clients WHERE id = p_client_id FOR UPDATE;

  SELECT COALESCE(array_agg(cc.collaborator_id), ARRAY[]::uuid[]),
         MAX(CASE WHEN cc.is_primary THEN cc.collaborator_id END)
    INTO v_ids, v_primary
    FROM public.client_collaborators cc
   WHERE cc.client_id = p_client_id;

  IF p_link THEN
    IF NOT (p_collaborator_id = ANY(v_ids)) THEN
      v_ids := array_append(v_ids, p_collaborator_id);
    END IF;
  ELSE
    v_ids := ARRAY(SELECT x FROM unnest(v_ids) x WHERE x <> p_collaborator_id);
    IF v_primary = p_collaborator_id THEN
      v_primary := p_replacement_collaborator_id;
    END IF;
  END IF;

  IF v_primary IS NOT NULL AND NOT (v_primary = ANY(v_ids)) THEN
    v_primary := NULL;
  END IF;

  RETURN public.admin_sync_client_collaborators(p_client_id, v_ids, v_primary);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_collaborator_client_link(uuid, uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_collaborator_client_link(uuid, uuid, boolean, uuid) TO authenticated, service_role;

-- 4) Criação de empresa passa a receber o principal (assinatura única, sem ambiguidade)
DROP FUNCTION IF EXISTS public.admin_create_client_with_user(jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.admin_create_client_with_user(jsonb, uuid, text, uuid[]);

CREATE OR REPLACE FUNCTION public.admin_create_client_with_user(
  _payload jsonb,
  _user_id uuid,
  _papel text DEFAULT 'responsavel',
  _collaborator_ids uuid[] DEFAULT NULL,
  _primary_collaborator_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id uuid;
  v_exists boolean;
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

  PERFORM public.admin_sync_client_collaborators(
    v_client_id, _collaborator_ids, _primary_collaborator_id
  );

  RETURN v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_client_with_user(jsonb, uuid, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_client_with_user(jsonb, uuid, text, uuid[], uuid) TO authenticated, service_role;
