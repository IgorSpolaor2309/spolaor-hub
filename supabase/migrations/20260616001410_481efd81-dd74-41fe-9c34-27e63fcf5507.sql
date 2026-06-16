
-- 1) Colaboradores: tornar profile_id opcional (renomear para user_id) e adicionar dados próprios
ALTER TABLE public.collaborators RENAME COLUMN profile_id TO user_id;
ALTER TABLE public.collaborators DROP CONSTRAINT IF EXISTS collaborators_profile_id_key;
ALTER TABLE public.collaborators ADD CONSTRAINT collaborators_user_id_key UNIQUE (user_id);
ALTER TABLE public.collaborators ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS observacoes text;

-- Backfill a partir de profiles vinculados
UPDATE public.collaborators c
SET nome = COALESCE(NULLIF(c.nome,''), p.full_name),
    email = COALESCE(c.email, p.email),
    telefone = COALESCE(c.telefone, p.phone)
FROM public.profiles p
WHERE c.user_id = p.id;

UPDATE public.collaborators SET nome = COALESCE(NULLIF(nome,''), 'Sem nome') WHERE nome IS NULL OR nome = '';
ALTER TABLE public.collaborators ALTER COLUMN nome SET NOT NULL;

-- Atualizar policy "Collab: self read" para usar user_id
DROP POLICY IF EXISTS "Collab: self read" ON public.collaborators;
CREATE POLICY "Collab: self read" ON public.collaborators
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 2) client_collaborators: passar a referenciar collaborators(id)
ALTER TABLE public.client_collaborators DROP CONSTRAINT IF EXISTS client_collaborators_collaborator_profile_id_fkey;
ALTER TABLE public.client_collaborators DROP CONSTRAINT IF EXISTS client_collaborators_client_id_collaborator_profile_id_key;
ALTER TABLE public.client_collaborators RENAME COLUMN collaborator_profile_id TO collaborator_id;
ALTER TABLE public.client_collaborators
  ADD CONSTRAINT client_collaborators_collaborator_id_fkey
  FOREIGN KEY (collaborator_id) REFERENCES public.collaborators(id) ON DELETE CASCADE;
ALTER TABLE public.client_collaborators
  ADD CONSTRAINT client_collaborators_client_collab_key UNIQUE (client_id, collaborator_id);

DROP POLICY IF EXISTS "CC: self read" ON public.client_collaborators;
CREATE POLICY "CC: self read" ON public.client_collaborators
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.collaborators c WHERE c.id = collaborator_id AND c.user_id = auth.uid()));

-- 3) Atualizar função user_has_client_access para usar nova coluna
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND owner_profile_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = _client_id AND c.user_id = _user_id
    )
$$;

-- 4) Função segura para administradores alterarem o perfil de acesso de um usuário
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar perfis de acesso' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() AND _role <> 'admin' AND public.is_admin(auth.uid()) THEN
    -- impedir admin remover o próprio papel de admin se for o único
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'Não é possível remover o último administrador' USING ERRCODE = '42501';
    END IF;
  END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, app_role) TO authenticated;
