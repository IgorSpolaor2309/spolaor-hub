
-- =========== Parte 2: validade nos documentos existentes ===========
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS data_validade DATE,
  ADD COLUMN IF NOT EXISTS categoria_validade TEXT;

-- =========== Parte 1: document_requests ===========
CREATE TABLE public.document_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  responsavel_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  competencia TEXT,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  observacoes_internas TEXT,
  omie_documento_id TEXT,
  omie_last_synced_at TIMESTAMPTZ,
  omie_sync_status TEXT,
  omie_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requests TO authenticated;
GRANT ALL ON public.document_requests TO service_role;

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View doc requests if has client access"
  ON public.document_requests FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));

CREATE POLICY "Admin and assigned collab manage doc requests"
  ON public.document_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = document_requests.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin and assigned collab update doc requests"
  ON public.document_requests FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = document_requests.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = document_requests.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Client may mark request as sent"
  ON public.document_requests FOR UPDATE TO authenticated
  USING (
    NOT public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = document_requests.client_id AND cl.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('enviado pelo cliente', 'reenviar')
  );

CREATE POLICY "Admin can delete doc requests"
  ON public.document_requests FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER set_document_requests_updated_at
  BEFORE UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_document_requests_client ON public.document_requests(client_id);
CREATE INDEX idx_document_requests_status ON public.document_requests(status);

-- =========== Parte 3: tax_guides ===========
CREATE TABLE public.tax_guides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  competencia TEXT,
  vencimento DATE,
  valor NUMERIC(14, 2),
  storage_path TEXT,
  nome_arquivo TEXT,
  status TEXT NOT NULL DEFAULT 'gerada',
  observacoes_internas TEXT,
  comprovante_path TEXT,
  comprovante_uploaded_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  omie_titulo_id TEXT,
  omie_last_synced_at TIMESTAMPTZ,
  omie_sync_status TEXT,
  omie_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_guides TO authenticated;
GRANT ALL ON public.tax_guides TO service_role;

ALTER TABLE public.tax_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View guides if has client access"
  ON public.tax_guides FOR SELECT TO authenticated
  USING (public.user_has_client_access(auth.uid(), client_id));

CREATE POLICY "Admin and assigned collab insert guides"
  ON public.tax_guides FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = tax_guides.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin and assigned collab update guides"
  ON public.tax_guides FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = tax_guides.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = tax_guides.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Client may attach payment proof"
  ON public.tax_guides FOR UPDATE TO authenticated
  USING (
    NOT public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clients cl
      WHERE cl.id = tax_guides.client_id AND cl.owner_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('paga', 'visualizada')
  );

CREATE POLICY "Admin can delete guides"
  ON public.tax_guides FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER set_tax_guides_updated_at
  BEFORE UPDATE ON public.tax_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_tax_guides_client ON public.tax_guides(client_id);
CREATE INDEX idx_tax_guides_status ON public.tax_guides(status);
CREATE INDEX idx_tax_guides_vencimento ON public.tax_guides(vencimento);
