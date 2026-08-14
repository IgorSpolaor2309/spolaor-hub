ALTER TABLE public.commercial_prospects ALTER COLUMN contact_name DROP NOT NULL;

-- Garantir que as outras colunas de contato também permitam NULL para rastreamento progressivo
ALTER TABLE public.commercial_prospects ALTER COLUMN contact_email DROP NOT NULL;
ALTER TABLE public.commercial_prospects ALTER COLUMN contact_phone DROP NOT NULL;

-- Aproveitar para garantir que a coluna de descrição de interação esteja presente e correta
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commercial_prospects' AND column_name='last_interaction_description') THEN
    ALTER TABLE public.commercial_prospects ADD COLUMN last_interaction_description TEXT;
  END IF;
END $$;