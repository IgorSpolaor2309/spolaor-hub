-- Add tracking columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercial_prospects' AND column_name = 'journey_step') THEN
        ALTER TABLE public.commercial_prospects ADD COLUMN journey_step text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercial_prospects' AND column_name = 'last_interaction_at') THEN
        ALTER TABLE public.commercial_prospects ADD COLUMN last_interaction_at timestamptz DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercial_prospects' AND column_name = 'bottleneck_indicator') THEN
        ALTER TABLE public.commercial_prospects ADD COLUMN bottleneck_indicator text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercial_prospects' AND column_name = 'estimated_value') THEN
        ALTER TABLE public.commercial_prospects ADD COLUMN estimated_value numeric;
    END IF;
END
$$;

-- Ensure RLS allows public updates for lead tracking
DROP POLICY IF EXISTS "Public can update own prospect journey" ON public.commercial_prospects;
CREATE POLICY "Public can update own prospect journey"
ON public.commercial_prospects
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Function to mark abandoned leads
CREATE OR REPLACE FUNCTION public.mark_abandoned_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.commercial_prospects
    SET status_comercial = 'abandonado',
        bottleneck_indicator = CASE 
            WHEN journey_step = 'conversa_iniciada' THEN 'Abandono antes do diagnóstico (falta de interesse ou fluxo longo)'
            WHEN journey_step = 'diagnostico_concluido' THEN 'Abandono após diagnóstico (possível objeção de valor)'
            WHEN journey_step = 'plano_visualizado' OR journey_step = 'preco_visualizado' THEN 'Abandono após ver preço (objeção de valor)'
            WHEN journey_step = 'checkout_iniciado' OR journey_step = 'cupom_aplicado' THEN 'Abandono no checkout (dúvida na contratação)'
            ELSE 'Inatividade prolongada'
        END
    WHERE status_comercial = 'interessado'
      AND last_interaction_at < now() - interval '24 hours';
END;
$$;
