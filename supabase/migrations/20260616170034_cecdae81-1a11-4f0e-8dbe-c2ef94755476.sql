
CREATE TABLE public.client_fiscal_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  regime_tributario TEXT,
  tipo_empresa TEXT,
  cnae_principal TEXT,
  cnaes_secundarios TEXT,
  inscricao_municipal TEXT,
  inscricao_estadual TEXT,
  municipio TEXT,
  uf TEXT,
  responsavel_legal TEXT,
  socios TEXT,
  possui_certificado_digital BOOLEAN,
  validade_certificado_digital DATE,
  prefeitura_sistema TEXT,
  observacoes_fiscais TEXT,
  observacoes_contabeis TEXT,
  observacoes_dp TEXT,
  observacoes_internas TEXT,
  omie_cliente_id TEXT,
  omie_last_synced_at TIMESTAMPTZ,
  omie_sync_status TEXT,
  omie_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_fiscal_data TO authenticated;
GRANT ALL ON public.client_fiscal_data TO service_role;

ALTER TABLE public.client_fiscal_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and assigned collaborators can view fiscal data"
  ON public.client_fiscal_data FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_fiscal_data.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin and assigned collaborators can insert fiscal data"
  ON public.client_fiscal_data FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_fiscal_data.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin and assigned collaborators can update fiscal data"
  ON public.client_fiscal_data FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_fiscal_data.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_fiscal_data.client_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admin can delete fiscal data"
  ON public.client_fiscal_data FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER set_client_fiscal_data_updated_at
  BEFORE UPDATE ON public.client_fiscal_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
