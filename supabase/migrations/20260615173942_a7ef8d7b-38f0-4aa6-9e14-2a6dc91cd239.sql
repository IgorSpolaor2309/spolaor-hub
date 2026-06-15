
-- Roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin','collaborator','client');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profiles policies
CREATE POLICY "Profiles: self select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Profiles: self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Profiles: admin insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Profiles: admin delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- user_roles policies
CREATE POLICY "Roles: self read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- Collaborators
CREATE TABLE public.collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  cargo TEXT,
  departamento TEXT,
  data_admissao DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collaborators TO authenticated;
GRANT ALL ON public.collaborators TO service_role;
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_collab_updated BEFORE UPDATE ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Collab: admin all" ON public.collaborators FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Collab: self read" ON public.collaborators FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  data_entrada DATE DEFAULT CURRENT_DATE,
  tipo TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  owner_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  omie_id TEXT,
  origem_cadastro TEXT NOT NULL DEFAULT 'manual',
  data_ultima_sincronizacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- client_collaborators
CREATE TABLE public.client_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  collaborator_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, collaborator_profile_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_collaborators TO authenticated;
GRANT ALL ON public.client_collaborators TO service_role;
ALTER TABLE public.client_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CC: admin all" ON public.client_collaborators FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "CC: self read" ON public.client_collaborators FOR SELECT TO authenticated
  USING (collaborator_profile_id = auth.uid());

-- Access helper
CREATE OR REPLACE FUNCTION public.user_has_client_access(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.clients WHERE id = _client_id AND owner_profile_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.client_collaborators WHERE client_id = _client_id AND collaborator_profile_id = _user_id)
$$;

-- Clients policies
CREATE POLICY "Clients: admin all" ON public.clients FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Clients: linked read" ON public.clients FOR SELECT TO authenticated
  USING (
    owner_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.client_collaborators cc WHERE cc.client_id = clients.id AND cc.collaborator_profile_id = auth.uid())
  );

-- Pending tasks
CREATE TABLE public.pending_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'aberta',
  prioridade TEXT NOT NULL DEFAULT 'media',
  collaborator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  competencia TEXT,
  data_conclusao TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_tasks TO authenticated;
GRANT ALL ON public.pending_tasks TO service_role;
ALTER TABLE public.pending_tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.pending_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Tasks: access read" ON public.pending_tasks FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Tasks: admin write" ON public.pending_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Tasks: admin/collab update" ON public.pending_tasks FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.client_collaborators cc WHERE cc.client_id = pending_tasks.client_id AND cc.collaborator_profile_id = auth.uid()));
CREATE POLICY "Tasks: admin delete" ON public.pending_tasks FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'outro',
  competencia TEXT,
  status TEXT NOT NULL DEFAULT 'recebido',
  observacoes TEXT,
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_docs_updated BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Docs: access read" ON public.documents FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Docs: access insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Docs: admin/collab update" ON public.documents FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.client_collaborators cc WHERE cc.client_id = documents.client_id AND cc.collaborator_profile_id = auth.uid()));
CREATE POLICY "Docs: admin delete" ON public.documents FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Requirements
CREATE TABLE public.document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  periodicidade TEXT NOT NULL DEFAULT 'mensal',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requirements TO authenticated;
GRANT ALL ON public.document_requirements TO service_role;
ALTER TABLE public.document_requirements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_reqs_updated BEFORE UPDATE ON public.document_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Reqs: access read" ON public.document_requirements FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Reqs: admin write" ON public.document_requirements FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Timeline
CREATE TABLE public.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.timeline_events TO authenticated;
GRANT ALL ON public.timeline_events TO service_role;
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timeline: access read" ON public.timeline_events FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Timeline: access insert" ON public.timeline_events FOR INSERT TO authenticated
  WITH CHECK (public.user_has_client_access(auth.uid(), client_id));

-- Interactions
CREATE TABLE public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  anexos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interactions TO authenticated;
GRANT ALL ON public.interactions TO service_role;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_inter_updated BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Inter: access read" ON public.interactions FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));
CREATE POLICY "Inter: admin/collab insert" ON public.interactions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.client_collaborators cc WHERE cc.client_id = interactions.client_id AND cc.collaborator_profile_id = auth.uid()));
CREATE POLICY "Inter: admin delete" ON public.interactions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  link TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notif: own read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Notif: own update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Notif: own delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================
-- TIMELINE TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.log_client_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao)
  VALUES (NEW.id, auth.uid(), 'cliente_criado', 'Cliente cadastrado: '||NEW.razao_social);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_log_client_created AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_created();

CREATE OR REPLACE FUNCTION public.log_task_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'pendencia_criada', 'Pendência criada: '||NEW.titulo, jsonb_build_object('task_id', NEW.id));
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.status <> OLD.status THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, auth.uid(),
        CASE WHEN NEW.status='concluida' THEN 'pendencia_concluida' ELSE 'pendencia_atualizada' END,
        'Pendência "'||NEW.titulo||'" → '||NEW.status,
        jsonb_build_object('task_id', NEW.id, 'old_status', OLD.status, 'new_status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_log_task AFTER INSERT OR UPDATE ON public.pending_tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_event();

CREATE OR REPLACE FUNCTION public.log_document_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'documento_enviado', 'Documento enviado: '||NEW.nome, jsonb_build_object('doc_id', NEW.id));
  ELSIF TG_OP='UPDATE' AND NEW.status <> OLD.status THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(),
      CASE WHEN NEW.status='aprovado' THEN 'documento_aprovado'
           WHEN NEW.status='recusado' THEN 'documento_recusado'
           ELSE 'documento_atualizado' END,
      'Documento "'||NEW.nome||'" → '||NEW.status,
      jsonb_build_object('doc_id', NEW.id));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_log_doc AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.log_document_event();

CREATE OR REPLACE FUNCTION public.log_interaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
  VALUES (NEW.client_id, auth.uid(), 'interacao_registrada', NEW.tipo||': '||LEFT(NEW.descricao, 120), jsonb_build_object('interaction_id', NEW.id));
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_log_interaction AFTER INSERT ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.log_interaction();
