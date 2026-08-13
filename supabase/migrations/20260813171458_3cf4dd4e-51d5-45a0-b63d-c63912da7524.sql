-- Migração: Recuperação Comercial e Gestão de Leads
-- Adiciona campos para responsável, prioridade, próxima ação e histórico.

-- 1. Novos campos na tabela commercial_prospects
ALTER TABLE public.commercial_prospects 
ADD COLUMN IF NOT EXISTS responsible_profile_id uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'média',
ADD COLUMN IF NOT EXISTS next_action_description text,
ADD COLUMN IF NOT EXISTS next_action_date timestamptz,
ADD COLUMN IF NOT EXISTS internal_notes text;

-- 2. Tabela de Histórico de Contatos
CREATE TABLE IF NOT EXISTS public.commercial_prospect_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id uuid REFERENCES public.commercial_prospects(id) ON DELETE CASCADE NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) NOT NULL,
    action_type text NOT NULL,
    content text,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- 3. Segurança e RLS
ALTER TABLE public.commercial_prospect_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.commercial_prospect_history TO authenticated;
GRANT ALL ON public.commercial_prospect_history TO service_role;

-- Políticas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'commercial_prospect_history' AND policyname = 'Collaborators can view history'
    ) THEN
        CREATE POLICY "Collaborators can view history"
        ON public.commercial_prospect_history
        FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'commercial_prospect_history' AND policyname = 'Collaborators can insert history'
    ) THEN
        CREATE POLICY "Collaborators can insert history"
        ON public.commercial_prospect_history
        FOR INSERT
        TO authenticated
        WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));
    END IF;
END $$;
