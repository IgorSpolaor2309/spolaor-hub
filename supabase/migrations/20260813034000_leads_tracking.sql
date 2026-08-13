-- FASE: DIGITAL SC — ÁREA DE LEADS + ABANDONO DA LANDING

-- 1. Evoluir commercial_prospects para rastrear jornada e abandono
ALTER TABLE public.commercial_prospects 
ADD COLUMN IF NOT EXISTS journey_step text DEFAULT 'conversa_iniciada',
ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS bottleneck_indicator text,
ADD COLUMN IF NOT EXISTS estimated_value numeric(10,2);

-- 2. RLS e Permissões
-- Nota: A tabela já deve ter GRANT SELECT para authenticated, mas reforçamos.
GRANT SELECT, INSERT, UPDATE ON public.commercial_prospects TO authenticated;
GRANT ALL ON public.commercial_prospects TO service_role;
GRANT INSERT, UPDATE ON public.commercial_prospects TO anon;

-- Ajustar políticas para evitar recursão ou erros se já existirem
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Collaborators can view all prospects" ON public.commercial_prospects;
    DROP POLICY IF EXISTS "Collaborators can update prospects" ON public.commercial_prospects;
    
    CREATE POLICY "Collaborators can view all prospects"
    ON public.commercial_prospects
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));

    CREATE POLICY "Collaborators can update prospects"
    ON public.commercial_prospects
    FOR UPDATE
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'collaborator'));
END $$;
