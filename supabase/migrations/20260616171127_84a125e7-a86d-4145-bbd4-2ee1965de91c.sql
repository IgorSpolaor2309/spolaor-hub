
-- 1) Departamento em pendências (Kanban)
ALTER TABLE public.pending_tasks
  ADD COLUMN IF NOT EXISTS departamento TEXT;

-- 2) Modelos de mensagens
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outros',
  assunto TEXT,
  conteudo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT ALL ON public.message_templates TO service_role;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view templates"
  ON public.message_templates FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'collaborator'));

CREATE POLICY "Admins manage templates insert"
  ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage templates update"
  ON public.message_templates FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage templates delete"
  ON public.message_templates FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Integração OMIE (preparação)
CREATE TABLE IF NOT EXISTS public.omie_integration (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'desativada',
  app_key TEXT,
  app_secret TEXT,
  ambiente TEXT,
  sync_ativa BOOLEAN NOT NULL DEFAULT false,
  frequencia_sync TEXT,
  ultima_sincronizacao TIMESTAMPTZ,
  proxima_sincronizacao TIMESTAMPTZ,
  responsavel_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacoes_internas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omie_integration TO authenticated;
GRANT ALL ON public.omie_integration TO service_role;
ALTER TABLE public.omie_integration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view omie integration"
  ON public.omie_integration FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins insert omie integration"
  ON public.omie_integration FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins update omie integration"
  ON public.omie_integration FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete omie integration"
  ON public.omie_integration FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_omie_integration_updated_at
  BEFORE UPDATE ON public.omie_integration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.omie_integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tipo_operacao TEXT,
  modulo TEXT,
  status TEXT,
  mensagem TEXT,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.omie_integration_logs TO authenticated;
GRANT ALL ON public.omie_integration_logs TO service_role;
ALTER TABLE public.omie_integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view omie logs"
  ON public.omie_integration_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage omie logs"
  ON public.omie_integration_logs FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
