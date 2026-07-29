-- =====================================================================
-- FASE 6 — Central de Documentos: histórico 1:N, conclusão automática,
-- reaproveitamento de documentos e acesso seguro a arquivos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELA DE HISTÓRICO 1:N
-- ---------------------------------------------------------------------
CREATE TABLE public.document_request_files (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  document_id         uuid NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  version_number      integer NOT NULL,
  submitted_by        uuid,
  submitted_by_role   text NOT NULL DEFAULT 'client'
                      CHECK (submitted_by_role IN ('admin','collaborator','client','system')),
  submitted_at        timestamptz NOT NULL DEFAULT now(),
  submission_type     text NOT NULL DEFAULT 'original'
                      CHECK (submission_type IN ('original','reenvio','arquivo_final','reaproveitado')),
  request_status_at   text,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  is_demo             boolean NOT NULL DEFAULT false,
  demo_batch_id       uuid,
  CONSTRAINT document_request_files_unique_doc UNIQUE (document_request_id, document_id),
  CONSTRAINT document_request_files_version_positive CHECK (version_number > 0)
);

-- somente UMA versão ativa por solicitação
CREATE UNIQUE INDEX document_request_files_one_active
  ON public.document_request_files (document_request_id)
  WHERE active;

CREATE UNIQUE INDEX document_request_files_version_seq
  ON public.document_request_files (document_request_id, version_number);

CREATE INDEX document_request_files_request_idx
  ON public.document_request_files (document_request_id, version_number DESC);

CREATE INDEX document_request_files_document_idx
  ON public.document_request_files (document_id);

-- ---------------------------------------------------------------------
-- 2. GRANTS MÍNIMOS
-- ---------------------------------------------------------------------
REVOKE ALL ON public.document_request_files FROM PUBLIC;
REVOKE ALL ON public.document_request_files FROM anon;
GRANT SELECT ON public.document_request_files TO authenticated;
GRANT ALL ON public.document_request_files TO service_role;

-- ---------------------------------------------------------------------
-- 3. RLS PRÓPRIA
-- ---------------------------------------------------------------------
ALTER TABLE public.document_request_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drf_select_staff"
  ON public.document_request_files FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
        FROM public.document_requests dr
        JOIN public.clients c ON c.id = dr.client_id
       WHERE dr.id = document_request_files.document_request_id
         AND (
           c.owner_profile_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.client_collaborators cc
              JOIN public.collaborators col ON col.id = cc.collaborator_id
             WHERE cc.client_id = dr.client_id AND col.user_id = auth.uid()
           )
         )
    )
  );

CREATE POLICY "drf_select_client"
  ON public.document_request_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.document_requests dr
        JOIN public.client_users cu ON cu.client_id = dr.client_id
       WHERE dr.id = document_request_files.document_request_id
         AND cu.user_id = auth.uid()
         AND cu.ativo = true
    )
  );

-- escrita apenas por funções SECURITY DEFINER / service_role
CREATE POLICY "drf_insert_admin"
  ON public.document_request_files FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "drf_update_admin"
  ON public.document_request_files FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- nenhuma policy de DELETE: histórico é imutável

-- ---------------------------------------------------------------------
-- 4. TRIGGER DE CONSISTÊNCIA (cross-empresa / Real-Demo / versão)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_drf_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req  public.document_requests%ROWTYPE;
  v_doc  public.documents%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.document_requests WHERE id = NEW.document_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação inexistente.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_doc FROM public.documents WHERE id = NEW.document_id;
  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento inexistente.' USING ERRCODE = '23503';
  END IF;

  -- cross-empresa
  IF v_doc.client_id <> v_req.client_id THEN
    RAISE EXCEPTION 'Documento pertence a outra empresa.' USING ERRCODE = '42501';
  END IF;

  -- documento excluído
  IF v_doc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Documento excluído não pode ser vinculado.' USING ERRCODE = '42501';
  END IF;

  -- Real/Demo
  IF COALESCE(v_doc.is_demo, false) <> COALESCE(v_req.is_demo, false) THEN
    RAISE EXCEPTION 'Inconsistência entre dados reais e de demonstração.' USING ERRCODE = '42501';
  END IF;

  -- lote demo divergente
  IF COALESCE(v_req.is_demo, false)
     AND v_doc.demo_batch_id IS DISTINCT FROM v_req.demo_batch_id THEN
    RAISE EXCEPTION 'Documento pertence a outro lote de demonstração.' USING ERRCODE = '42501';
  END IF;

  NEW.is_demo       := COALESCE(v_req.is_demo, false);
  NEW.demo_batch_id := v_req.demo_batch_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.version_number IS NULL OR NEW.version_number <= 0 THEN
      SELECT COALESCE(MAX(version_number), 0) + 1
        INTO NEW.version_number
        FROM public.document_request_files
       WHERE document_request_id = NEW.document_request_id;
    END IF;
    IF NEW.request_status_at IS NULL THEN
      NEW.request_status_at := v_req.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_drf_consistency
  BEFORE INSERT OR UPDATE OF document_request_id, document_id, is_demo, demo_batch_id
  ON public.document_request_files
  FOR EACH ROW EXECUTE FUNCTION public.enforce_drf_consistency();

-- desativa versões anteriores quando uma nova versão ativa entra
CREATE OR REPLACE FUNCTION public.drf_deactivate_previous()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active THEN
    UPDATE public.document_request_files
       SET active = false
     WHERE document_request_id = NEW.document_request_id
       AND id <> NEW.id
       AND active;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_drf_deactivate_previous
  AFTER INSERT OR UPDATE OF active ON public.document_request_files
  FOR EACH ROW WHEN (NEW.active) EXECUTE FUNCTION public.drf_deactivate_previous();

-- bloqueio de hard delete
CREATE OR REPLACE FUNCTION public.drf_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Histórico de arquivos não pode ser excluído.' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_drf_block_delete
  BEFORE DELETE ON public.document_request_files
  FOR EACH ROW EXECUTE FUNCTION public.drf_block_delete();

-- ---------------------------------------------------------------------
-- 5. TABELA DE PENDÊNCIAS DE ASSOCIAÇÃO (ambiguidade explícita)
-- ---------------------------------------------------------------------
CREATE TABLE public.document_request_link_issues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  issue_type          text NOT NULL
                      CHECK (issue_type IN ('checklist_ambiguo','checklist_nao_encontrado',
                                            'requisito_conflito','requisito_invalido')),
  detalhes            jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at         timestamptz,
  resolved_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  is_demo             boolean NOT NULL DEFAULT false,
  demo_batch_id       uuid
);

CREATE INDEX drli_request_idx ON public.document_request_link_issues (document_request_id);
CREATE INDEX drli_open_idx ON public.document_request_link_issues (client_id) WHERE resolved_at IS NULL;

REVOKE ALL ON public.document_request_link_issues FROM PUBLIC;
REVOKE ALL ON public.document_request_link_issues FROM anon;
GRANT SELECT, UPDATE ON public.document_request_link_issues TO authenticated;
GRANT ALL ON public.document_request_link_issues TO service_role;

ALTER TABLE public.document_request_link_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drli_select_staff"
  ON public.document_request_link_issues FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = document_request_link_issues.client_id
         AND (
           c.owner_profile_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM public.client_collaborators cc
              JOIN public.collaborators col ON col.id = cc.collaborator_id
             WHERE cc.client_id = c.id AND col.user_id = auth.uid()
           )
         )
    )
  );

CREATE POLICY "drli_update_staff"
  ON public.document_request_link_issues FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.id = document_request_link_issues.client_id
         AND c.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- ---------------------------------------------------------------------
-- 6. BACKFILL IDEMPOTENTE DO HISTÓRICO EXISTENTE
-- ---------------------------------------------------------------------
INSERT INTO public.document_request_files (
  document_request_id, document_id, version_number,
  submitted_by, submitted_by_role, submitted_at,
  submission_type, request_status_at, active, is_demo, demo_batch_id
)
SELECT
  dr.id,
  dr.document_id,
  1,
  d.uploaded_by,
  'system',
  -- fallback documentado: data real do documento; se ausente, data da solicitação
  COALESCE(d.created_at, dr.updated_at, dr.created_at),
  'original',
  dr.status,
  true,
  COALESCE(dr.is_demo, false),
  dr.demo_batch_id
FROM public.document_requests dr
JOIN public.documents d ON d.id = dr.document_id
WHERE dr.document_id IS NOT NULL
  AND d.deleted_at IS NULL
  AND d.client_id = dr.client_id
  AND COALESCE(d.is_demo,false) = COALESCE(dr.is_demo,false)
  AND NOT EXISTS (
    SELECT 1 FROM public.document_request_files f
     WHERE f.document_request_id = dr.id AND f.document_id = dr.document_id
  );

-- ---------------------------------------------------------------------
-- 7. VERIFICAÇÃO DE ACESSO A ARQUIVO (nunca devolve storage_path)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_user_access_document(_user_id uuid, _document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.documents d
      JOIN public.clients c ON c.id = d.client_id
     WHERE d.id = _document_id
       AND d.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND (
         public.has_role(_user_id, 'admin')
         OR c.owner_profile_id = _user_id
         OR EXISTS (
           SELECT 1 FROM public.client_collaborators cc
            JOIN public.collaborators col ON col.id = cc.collaborator_id
           WHERE cc.client_id = d.client_id AND col.user_id = _user_id
         )
         OR EXISTS (
           SELECT 1 FROM public.client_users cu
            WHERE cu.client_id = d.client_id AND cu.user_id = _user_id AND cu.ativo = true
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION public.can_user_access_document(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_user_access_document(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_user_access_document(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. HISTÓRICO — STAFF (whitelist explícita de colunas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_document_request_files_staff(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_client uuid;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT dr.client_id INTO v_client
    FROM public.document_requests dr
   WHERE dr.id = _request_id AND dr.deleted_at IS NULL;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = v_client AND c.owner_profile_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
                JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = v_client AND col.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'version_number' DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'id', f.id,
             'version_number', f.version_number,
             'document_id', f.document_id,
             'document_name', d.nome,
             'document_tipo', d.tipo,
             'document_competencia', d.competencia,
             'data_validade', d.data_validade,
             'submitted_at', f.submitted_at,
             'submitted_by_name', p.full_name,
             'submitted_by_role', f.submitted_by_role,
             'submission_type', f.submission_type,
             'request_status_at', f.request_status_at,
             'active', f.active,
             'is_demo', f.is_demo
           ) AS x
      FROM public.document_request_files f
      JOIN public.documents d ON d.id = f.document_id
      LEFT JOIN public.profiles p ON p.id = f.submitted_by
     WHERE f.document_request_id = _request_id
  ) s;

  RETURN jsonb_build_object('items', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.list_document_request_files_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_document_request_files_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_document_request_files_staff(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9. HISTÓRICO — CLIENTE (whitelist reduzida, linguagem simples)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_document_request_files_client(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_client uuid;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT dr.client_id INTO v_client
    FROM public.document_requests dr
   WHERE dr.id = _request_id AND dr.deleted_at IS NULL;

  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.client_users cu
     WHERE cu.client_id = v_client AND cu.user_id = v_uid AND cu.ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'version_number')::int DESC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'id', f.id,
             'version_number', f.version_number,
             'document_id', f.document_id,
             'document_name', d.nome,
             'submitted_at', f.submitted_at,
             'active', f.active,
             'label', CASE
                        WHEN f.submission_type = 'arquivo_final' THEN 'Arquivo da contabilidade'
                        WHEN f.version_number = 1 THEN 'Primeiro envio'
                        ELSE 'Reenvio ' || (f.version_number - 1)::text
                      END
           ) AS x
      FROM public.document_request_files f
      JOIN public.documents d ON d.id = f.document_id
     WHERE f.document_request_id = _request_id
       AND d.deleted_at IS NULL
       -- cliente vê apenas o que ele enviou ou o arquivo final destinado a ele
       AND (f.submitted_by_role = 'client' OR f.submission_type = 'arquivo_final')
  ) s;

  RETURN jsonb_build_object('items', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.list_document_request_files_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_document_request_files_client(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_document_request_files_client(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 10. UPLOAD DO CLIENTE — agora com histórico 1:N + idempotência
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_submit_document_request(
  _request_id uuid, _storage_path text, _nome text, _tipo text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.document_requests%ROWTYPE;
  v_doc_id uuid;
  v_existing uuid;
  v_type text;
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

  IF position(v_req.client_id::text || '/' in _storage_path) <> 1 THEN
    RAISE EXCEPTION 'Caminho de arquivo inválido.' USING ERRCODE = '42501';
  END IF;

  -- idempotência: mesmo caminho já registrado nesta solicitação
  SELECT d.id INTO v_existing
    FROM public.documents d
    JOIN public.document_request_files f ON f.document_id = d.id
   WHERE f.document_request_id = _request_id
     AND d.storage_path = _storage_path
     AND d.deleted_at IS NULL
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_type := CASE WHEN EXISTS (
      SELECT 1 FROM public.document_request_files WHERE document_request_id = _request_id
    ) THEN 'reenvio' ELSE 'original' END;

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

  INSERT INTO public.document_request_files (
    document_request_id, document_id, submitted_by, submitted_by_role,
    submission_type, request_status_at, active
  ) VALUES (
    _request_id, v_doc_id, v_uid, 'client', v_type, v_req.status, true
  );

  UPDATE public.document_requests
     SET document_id = v_doc_id,
         status      = 'recebido'
   WHERE id = _request_id;

  RETURN v_doc_id;
END;
$$;

-- ---------------------------------------------------------------------
-- 11. ANEXAR DOCUMENTO EXISTENTE (reaproveitamento / arquivo final)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_attach_document_to_request(
  _request_id uuid,
  _document_id uuid,
  _submission_type text DEFAULT 'reaproveitado',
  _set_recebido boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.document_requests%ROWTYPE;
  v_doc public.documents%ROWTYPE;
  v_role text;
  v_file_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _submission_type NOT IN ('reaproveitado','arquivo_final') THEN
    RAISE EXCEPTION 'Tipo de envio inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.document_requests WHERE id = _request_id;
  IF v_req.id IS NULL OR v_req.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = '42501';
  END IF;

  v_role := CASE WHEN public.has_role(v_uid, 'admin') THEN 'admin' ELSE 'collaborator' END;

  IF NOT (
    public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = v_req.client_id AND c.owner_profile_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
                JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = v_req.client_id AND col.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM public.documents WHERE id = _document_id;
  IF v_doc.id IS NULL OR v_doc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Documento não encontrado.' USING ERRCODE = '42501';
  END IF;

  -- validações de empresa e Real/Demo também ocorrem no trigger da tabela
  IF v_doc.client_id <> v_req.client_id THEN
    RAISE EXCEPTION 'Documento pertence a outra empresa.' USING ERRCODE = '42501';
  END IF;

  -- vínculo duplicado é idempotente
  SELECT id INTO v_file_id
    FROM public.document_request_files
   WHERE document_request_id = _request_id AND document_id = _document_id;

  IF v_file_id IS NOT NULL THEN
    UPDATE public.document_request_files SET active = true WHERE id = v_file_id;
  ELSE
    INSERT INTO public.document_request_files (
      document_request_id, document_id, submitted_by, submitted_by_role,
      submission_type, request_status_at, active
    ) VALUES (
      _request_id, _document_id, v_uid, v_role, _submission_type, v_req.status, true
    )
    RETURNING id INTO v_file_id;
  END IF;

  UPDATE public.document_requests
     SET document_id = _document_id,
         status = CASE
                    WHEN _set_recebido AND status IN ('aguardando','reenviar') THEN 'recebido'
                    ELSE status
                  END
   WHERE id = _request_id;

  RETURN v_file_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_attach_document_to_request(uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_attach_document_to_request(uuid, uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_attach_document_to_request(uuid, uuid, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 12. DEFINIR VERSÃO ANTERIOR COMO ATUAL (admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_set_active_request_file(_file_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_file public.document_request_files%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar a versão atual.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_file FROM public.document_request_files WHERE id = _file_id;
  IF v_file.id IS NULL THEN
    RAISE EXCEPTION 'Versão não encontrada.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.document_request_files SET active = true WHERE id = _file_id;

  UPDATE public.document_requests
     SET document_id = v_file.document_id
   WHERE id = v_file.document_request_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_set_active_request_file(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_set_active_request_file(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_set_active_request_file(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 13. BUSCA PAGINADA DE DOCUMENTOS DA EMPRESA (reaproveitamento)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_client_documents_paginated(
  _client_id uuid,
  _search text DEFAULT NULL,
  _tipo text DEFAULT NULL,
  _competencia text DEFAULT NULL,
  _validade_from date DEFAULT NULL,
  _validade_to date DEFAULT NULL,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_page int := GREATEST(COALESCE(_page,1),1);
  v_size int := LEAST(GREATEST(COALESCE(_page_size,20),1),50);
  v_offset int;
  v_pattern text := CASE WHEN NULLIF(btrim(COALESCE(_search,'')),'') IS NULL
                         THEN NULL ELSE '%'||btrim(_search)||'%' END;
  v_total int;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c
                WHERE c.id = _client_id AND c.owner_profile_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc
                JOIN public.collaborators col ON col.id = cc.collaborator_id
               WHERE cc.client_id = _client_id AND col.user_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.' USING ERRCODE = '42501';
  END IF;

  v_offset := (v_page - 1) * v_size;

  SELECT count(*) INTO v_total
    FROM public.documents d
   WHERE d.client_id = _client_id
     AND d.deleted_at IS NULL
     AND (v_pattern IS NULL OR d.nome ILIKE v_pattern)
     AND (_tipo IS NULL OR d.tipo = _tipo)
     AND (_competencia IS NULL OR d.competencia = _competencia)
     AND (_validade_from IS NULL OR d.data_validade >= _validade_from)
     AND (_validade_to IS NULL OR d.data_validade <= _validade_to);

  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
             'document_id', d.id,
             'nome', d.nome,
             'tipo', d.tipo,
             'categoria', d.categoria_validade,
             'competencia', d.competencia,
             'data_validade', d.data_validade,
             'created_at', d.created_at,
             'is_demo', d.is_demo,
             'linked_requests', (
               SELECT count(*) FROM public.document_request_files f
                WHERE f.document_id = d.id
             ),
             'linked_processes', (
               SELECT count(*) FROM public.company_process_documents cpd
                WHERE cpd.document_id = d.id
             )
           ) AS x
      FROM public.documents d
     WHERE d.client_id = _client_id
       AND d.deleted_at IS NULL
       AND (v_pattern IS NULL OR d.nome ILIKE v_pattern)
       AND (_tipo IS NULL OR d.tipo = _tipo)
       AND (_competencia IS NULL OR d.competencia = _competencia)
       AND (_validade_from IS NULL OR d.data_validade >= _validade_from)
       AND (_validade_to IS NULL OR d.data_validade <= _validade_to)
     ORDER BY d.created_at DESC, d.id DESC
     LIMIT v_size OFFSET v_offset
  ) s;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'total_pages', GREATEST(CEIL(v_total::numeric / v_size)::int, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.search_client_documents_paginated(uuid,text,text,text,date,date,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_client_documents_paginated(uuid,text,text,text,date,date,integer,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_client_documents_paginated(uuid,text,text,text,date,date,integer,integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 14. CONCLUSÃO AUTOMÁTICA DE CHECKLIST (com revalidação e ambiguidade)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conclude_checklist_from_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_candidates int;
BEGIN
  IF NEW.status <> 'concluido' OR OLD.status IS NOT DISTINCT FROM 'concluido' THEN
    RETURN NEW;
  END IF;

  -- NÍVEL 1: vínculo explícito já existente
  SELECT ci.id INTO v_item_id
    FROM public.client_checklist_items ci
   WHERE ci.document_request_id = NEW.id
     AND ci.client_id = NEW.client_id
     AND ci.deleted_at IS NULL
     AND ci.status <> 'concluido'
   ORDER BY ci.created_at, ci.id
   LIMIT 1;

  -- NÍVEL 2: inferência estrita por empresa + competência + categoria
  IF v_item_id IS NULL AND NEW.competencia IS NOT NULL AND NEW.categoria IS NOT NULL THEN
    SELECT count(*) INTO v_candidates
      FROM public.client_checklist_items ci
     WHERE ci.client_id = NEW.client_id
       AND ci.competencia = NEW.competencia
       AND ci.categoria = NEW.categoria
       AND ci.deleted_at IS NULL
       AND ci.status <> 'concluido'
       AND ci.document_request_id IS NULL
       AND COALESCE(ci.is_demo,false) = COALESCE(NEW.is_demo,false);

    IF v_candidates = 1 THEN
      SELECT ci.id INTO v_item_id
        FROM public.client_checklist_items ci
       WHERE ci.client_id = NEW.client_id
         AND ci.competencia = NEW.competencia
         AND ci.categoria = NEW.categoria
         AND ci.deleted_at IS NULL
         AND ci.status <> 'concluido'
         AND ci.document_request_id IS NULL
         AND COALESCE(ci.is_demo,false) = COALESCE(NEW.is_demo,false);
    ELSIF v_candidates > 1 THEN
      -- ambiguidade: NÃO escolher automaticamente; registrar pendência
      INSERT INTO public.document_request_link_issues (
        document_request_id, client_id, issue_type, detalhes, is_demo, demo_batch_id)
      VALUES (NEW.id, NEW.client_id, 'checklist_ambiguo',
        jsonb_build_object(
          'competencia', NEW.competencia,
          'categoria', NEW.categoria,
          'candidatos', v_candidates),
        COALESCE(NEW.is_demo,false), NEW.demo_batch_id);
      RETURN NEW;
    END IF;
  END IF;

  IF v_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- revalidação final de empresa e competência antes de concluir
  UPDATE public.client_checklist_items ci
     SET status        = 'concluido',
         document_id   = COALESCE(ci.document_id, NEW.document_id),
         document_request_id = COALESCE(ci.document_request_id, NEW.id),
         concluded_at  = COALESCE(ci.concluded_at, now()),
         concluded_by  = COALESCE(ci.concluded_by, auth.uid()),
         received_at   = COALESCE(ci.received_at, now())
   WHERE ci.id = v_item_id
     AND ci.client_id = NEW.client_id
     AND ci.status <> 'concluido'
     AND ci.deleted_at IS NULL
     AND (NEW.competencia IS NULL OR ci.competencia IS NULL OR ci.competencia = NEW.competencia);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dr_conclude_checklist
  AFTER UPDATE OF status ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.conclude_checklist_from_request();

-- ---------------------------------------------------------------------
-- 15. CONCLUSÃO AUTOMÁTICA DE REQUISITO NO STATUS 'concluido'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fulfill_requirement_on_conclude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
BEGIN
  IF NEW.status <> 'concluido' OR OLD.status IS NOT DISTINCT FROM 'concluido' THEN
    RETURN NEW;
  END IF;
  IF NEW.company_process_step_requirement_id IS NULL OR NEW.document_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.id, r.nome, r.document_id AS current_doc, r.company_process_step_id,
         cps.company_process_id, cp.client_id, cp.is_demo
    INTO v_req
    FROM public.company_process_step_requirements r
    JOIN public.company_process_steps cps ON cps.id = r.company_process_step_id
    JOIN public.company_processes cp ON cp.id = cps.company_process_id
   WHERE r.id = NEW.company_process_step_requirement_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- revalidação de empresa e Real/Demo
  IF v_req.client_id <> NEW.client_id
     OR COALESCE(v_req.is_demo,false) <> COALESCE(NEW.is_demo,false) THEN
    INSERT INTO public.document_request_link_issues (
      document_request_id, client_id, issue_type, detalhes, is_demo, demo_batch_id)
    VALUES (NEW.id, NEW.client_id, 'requisito_invalido',
      jsonb_build_object('requirement_id', v_req.id, 'requirement_client', v_req.client_id),
      COALESCE(NEW.is_demo,false), NEW.demo_batch_id);
    RETURN NEW;
  END IF;

  -- já atendido por outro documento: não substituir automaticamente
  IF v_req.current_doc IS NOT NULL AND v_req.current_doc <> NEW.document_id THEN
    INSERT INTO public.document_request_link_issues (
      document_request_id, client_id, issue_type, detalhes, is_demo, demo_batch_id)
    VALUES (NEW.id, NEW.client_id, 'requisito_conflito',
      jsonb_build_object('requirement_id', v_req.id,
                         'existing_document_id', v_req.current_doc,
                         'new_document_id', NEW.document_id),
      COALESCE(NEW.is_demo,false), NEW.demo_batch_id);
    RETURN NEW;
  END IF;

  IF v_req.current_doc IS NULL THEN
    UPDATE public.company_process_step_requirements
       SET document_id  = NEW.document_id,
           fulfilled_by = COALESCE(auth.uid(), NEW.criado_por),
           fulfilled_at = now()
     WHERE id = v_req.id
       AND document_id IS NULL;

    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'processo_requisito_atendido_solicitacao',
      'Requisito "'||v_req.nome||'" atendido pela conclusão da solicitação.',
      jsonb_build_object('process_id', v_req.company_process_id,
                         'step_id', v_req.company_process_step_id,
                         'requirement_id', v_req.id,
                         'request_id', NEW.id,
                         'document_id', NEW.document_id));
  END IF;

  -- vínculo do documento ao processo, sem duplicar
  IF v_req.company_process_id IS NOT NULL THEN
    INSERT INTO public.company_process_documents (
      company_process_id, company_process_step_id, document_id, created_by)
    SELECT v_req.company_process_id, v_req.company_process_step_id, NEW.document_id, auth.uid()
     WHERE NOT EXISTS (
       SELECT 1 FROM public.company_process_documents cpd
        WHERE cpd.company_process_id = v_req.company_process_id
          AND cpd.document_id = NEW.document_id
     );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dr_fulfill_on_conclude
  AFTER UPDATE OF status ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.fulfill_requirement_on_conclude();
