
CREATE TABLE public.client_month_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_documentos',
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, competencia)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_month_status TO authenticated;
GRANT ALL ON public.client_month_status TO service_role;

ALTER TABLE public.client_month_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View month status if has client access"
  ON public.client_month_status FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));

CREATE POLICY "Admin and assigned collab insert month status"
  ON public.client_month_status FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_month_status.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin and assigned collab update month status"
  ON public.client_month_status FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_month_status.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_month_status.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin can delete month status"
  ON public.client_month_status FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER set_client_month_status_updated_at
  BEFORE UPDATE ON public.client_month_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_client_month_status_competencia ON public.client_month_status(competencia);
