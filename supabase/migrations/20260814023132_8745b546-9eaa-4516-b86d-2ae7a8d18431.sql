-- 1. Create Contract Models table
CREATE TABLE public.contract_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'inativo')),
    content text NOT NULL,
    internal_notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    updated_by uuid REFERENCES auth.users(id)
);

-- Grant permissions for contract_models
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_models TO authenticated;
GRANT ALL ON public.contract_models TO service_role;

-- Enable RLS for contract_models
ALTER TABLE public.contract_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contract models" 
ON public.contract_models 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone authenticated can read active models" 
ON public.contract_models 
FOR SELECT 
TO authenticated 
USING (status = 'ativo');

-- 2. Create Generated Contracts table
CREATE TABLE public.generated_contracts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id uuid REFERENCES public.commercial_prospects(id) ON DELETE CASCADE,
    model_id uuid REFERENCES public.contract_models(id),
    version integer NOT NULL,
    content_snapshot text NOT NULL, -- Final immutable text
    status text NOT NULL DEFAULT 'aguardando_contrato' CHECK (status IN ('aguardando_contrato', 'contrato_gerado', 'contrato_enviado', 'contrato_assinado', 'cancelado')),
    
    -- Future Signature integration
    external_signature_id text,
    signature_provider text,
    sent_at timestamptz,
    signed_at timestamptz,
    external_status text,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    
    UNIQUE(prospect_id, version)
);

-- Grant permissions for generated_contracts
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_contracts TO authenticated;
GRANT ALL ON public.generated_contracts TO service_role;

-- Enable RLS for generated_contracts
ALTER TABLE public.generated_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage generated contracts" 
ON public.generated_contracts 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read their own contracts" 
ON public.generated_contracts 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.commercial_prospects cp ON cp.contact_email = p.email
        WHERE p.id = auth.uid() AND cp.id = prospect_id
    )
);

-- 3. Add validation trigger for models
CREATE OR REPLACE FUNCTION public.validate_contract_model_activation()
RETURNS trigger AS $$
BEGIN
    -- Only one active model per type
    IF NEW.status = 'ativo' THEN
        UPDATE public.contract_models 
        SET status = 'inativo', updated_at = now() 
        WHERE id != NEW.id AND status = 'ativo';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_model_activation
BEFORE UPDATE ON public.contract_models
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ativo')
EXECUTE FUNCTION public.validate_contract_model_activation();
