
-- =========================================================
-- 1) Nova tabela: vínculos multiempresa de contas de cliente
-- =========================================================
CREATE TABLE IF NOT EXISTS public.client_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel       text,
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_users TO authenticated;
GRANT ALL ON public.client_users TO service_role;

ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_users select" ON public.client_users;
CREATE POLICY "client_users select"
  ON public.client_users FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.client_collaborators cc
      JOIN public.collaborators col ON col.id = cc.collaborator_id
      WHERE cc.client_id = public.client_users.client_id
        AND col.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "client_users admin insert" ON public.client_users;
CREATE POLICY "client_users admin insert"
  ON public.client_users FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "client_users admin update" ON public.client_users;
CREATE POLICY "client_users admin update"
  ON public.client_users FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "client_users admin delete" ON public.client_users;
CREATE POLICY "client_users admin delete"
  ON public.client_users FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_client_users_updated_at ON public.client_users;
CREATE TRIGGER trg_client_users_updated_at
  BEFORE UPDATE ON public.client_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 2) Backfill idempotente a partir de clients.owner_profile_id
-- =========================================================
INSERT INTO public.client_users (client_id, user_id, ativo, papel)
SELECT id, owner_profile_id, true, 'responsavel'
  FROM public.clients
 WHERE owner_profile_id IS NOT NULL
ON CONFLICT (client_id, user_id) DO NOTHING;

-- =========================================================
-- 3) Função de acesso passa a considerar client_users (ativo)
-- =========================================================
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.clients
       WHERE id = _client_id AND owner_profile_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.client_users cu
       WHERE cu.client_id = _client_id
         AND cu.user_id   = _user_id
         AND cu.ativo     = true
    )
    OR EXISTS (
      SELECT 1
        FROM public.client_collaborators cc
        JOIN public.collaborators c ON c.id = cc.collaborator_id
       WHERE cc.client_id = _client_id
         AND c.user_id    = _user_id
    )
$function$;

-- =========================================================
-- 4) profiles_shares_client inclui vínculo via client_users
-- =========================================================
CREATE OR REPLACE FUNCTION public.profiles_shares_client(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- target é dono (legado) de cliente acessível ao viewer
    SELECT 1 FROM public.clients c
    WHERE c.owner_profile_id = _target
      AND public.user_has_client_access(_viewer, c.id)
  ) OR EXISTS (
    -- target é usuário cliente (nova tabela) de cliente acessível ao viewer
    SELECT 1 FROM public.client_users cu
    WHERE cu.user_id = _target
      AND cu.ativo   = true
      AND public.user_has_client_access(_viewer, cu.client_id)
  ) OR EXISTS (
    -- target é colaborador vinculado a cliente acessível ao viewer
    SELECT 1
    FROM public.collaborators col
    JOIN public.client_collaborators cc ON cc.collaborator_id = col.id
    WHERE col.user_id = _target
      AND public.user_has_client_access(_viewer, cc.client_id)
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'admin'
  );
$function$;

-- =========================================================
-- 5) Helper: lista todos os usuários cliente ativos de um client
-- =========================================================
CREATE OR REPLACE FUNCTION public.client_user_ids(_client_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT u FROM (
    SELECT owner_profile_id AS u
      FROM public.clients
     WHERE id = _client_id AND owner_profile_id IS NOT NULL
    UNION
    SELECT user_id AS u
      FROM public.client_users
     WHERE client_id = _client_id AND ativo = true AND user_id IS NOT NULL
  ) s WHERE u IS NOT NULL;
$function$;

-- =========================================================
-- 6) Helper: rótulo curto do cliente (nome_fantasia | razao_social)
-- =========================================================
CREATE OR REPLACE FUNCTION public.client_label(_client_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(nome_fantasia,''), razao_social, documento, 'Empresa')
    FROM public.clients WHERE id = _client_id
$function$;

-- =========================================================
-- 7) Notificações por evento — incluir empresa e iterar usuários cliente
-- =========================================================
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
BEGIN
  v_link    := '/solicitacoes';
  v_empresa := public.client_label(NEW.client_id);

  IF TG_OP = 'INSERT' THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'solicitacao',
        'Documento solicitado — ' || v_empresa,
        COALESCE(NEW.titulo, NEW.categoria, 'Documento solicitado'), v_link);
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status = 'reenviar' THEN
      FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento precisa ser reenviado — ' || v_empresa,
          COALESCE(NEW.titulo, 'A equipe pediu o reenvio de um documento.'), v_link);
      END LOOP;
    ELSIF NEW.status IN ('enviado pelo cliente','em análise')
       AND OLD.status NOT IN ('enviado pelo cliente','em análise') THEN
      FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
        PERFORM public.notify_user(v_user, 'solicitacao',
          'Documento enviado pelo cliente — ' || v_empresa,
          COALESCE(NEW.titulo, 'Há um documento aguardando análise.'), v_link);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.on_tax_guide_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_empresa text;
BEGIN
  v_empresa := public.client_label(NEW.client_id);

  IF TG_OP = 'INSERT' THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'guia',
        'Nova guia disponível — ' || v_empresa,
        COALESCE(NEW.tipo,'Guia') || ' - vencimento ' || COALESCE(to_char(NEW.vencimento,'DD/MM/YYYY'),'—'),
        '/guias');
    END LOOP;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.comprovante_path IS NOT NULL
     AND COALESCE(OLD.comprovante_path,'') = '' THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'guia',
        'Comprovante recebido — ' || v_empresa,
        COALESCE(NEW.tipo,'Guia') || ' - cliente enviou o comprovante.',
        '/guias');
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

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

  IF v_is_client THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'documento',
        'Documento enviado pelo cliente — ' || v_empresa,
        COALESCE(NEW.nome, 'Novo arquivo disponível.'),
        '/documentos');
    END LOOP;
  END IF;
  RETURN NEW;
END; $function$;

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
BEGIN
  UPDATE public.chat_conversations
    SET last_message_at = NEW.created_at, updated_at = now()
    WHERE id = NEW.conversation_id;

  v_empresa := public.client_label(NEW.client_id);
  v_link    := '/interacoes?conversation=' || NEW.conversation_id::text;
  v_preview := COALESCE(LEFT(NEW.body, 120),
                        CASE WHEN NEW.attachment_path IS NOT NULL
                             THEN '📎 ' || COALESCE(NEW.attachment_name,'anexo') END,
                        '(mensagem)');

  IF NEW.sender_role IN ('admin','collaborator') THEN
    FOR v_user IN SELECT public.client_user_ids(NEW.client_id) LOOP
      PERFORM public.notify_user(v_user, 'chat',
        'Nova mensagem da equipe — ' || v_empresa, v_preview, v_link);
    END LOOP;
  ELSIF NEW.sender_role = 'client' THEN
    FOR v_user IN SELECT public.client_staff_user_ids(NEW.client_id) LOOP
      IF v_user <> COALESCE(NEW.sender_profile_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(v_user, 'chat',
          'Nova mensagem do cliente — ' || v_empresa, v_preview, v_link);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END; $function$;
