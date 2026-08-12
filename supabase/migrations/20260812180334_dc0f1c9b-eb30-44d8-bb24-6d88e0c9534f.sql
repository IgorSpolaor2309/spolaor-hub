DROP FUNCTION IF EXISTS public.generate_plan_checklist(text);

-- Garantir que a tabela existe (talvez a migração S3 tenha falhado silenciosamente ou esteja pendente)
CREATE TABLE IF NOT EXISTS public.client_plan_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    plan_id uuid REFERENCES public.plans(id) ON DELETE CASCADE NOT NULL,
    competencia_inicio text NOT NULL,
    competencia_fim text,
    status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'encerrado')),
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_plan_history TO authenticated;
GRANT ALL ON public.client_plan_history TO service_role;
ALTER TABLE public.client_plan_history ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_checklist_items' AND column_name = 'plan_id') THEN
        ALTER TABLE public.client_checklist_items ADD COLUMN plan_id uuid REFERENCES public.plans(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_checklist_items' AND column_name = 'service_id') THEN
        ALTER TABLE public.client_checklist_items ADD COLUMN service_id uuid REFERENCES public.services(id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_plan_checklist(_competencia text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_criados int := 0;
    v_ignorados int := 0;
    v_sem_plano int := 0;
    v_empresa record;
    v_plano_id uuid;
    v_item record;
BEGIN
    IF _competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Formato de competência inválido: %. Use AAAA-MM', _competencia;
    END IF;

    FOR v_empresa IN 
        SELECT id, razao_social 
        FROM public.clients 
        WHERE status = 'active' AND deleted_at IS NULL
    LOOP
        SELECT plan_id INTO v_plano_id
        FROM public.client_plan_history
        WHERE client_id = v_empresa.id
          AND competencia_inicio <= _competencia
          AND (competencia_fim IS NULL OR competencia_fim >= _competencia)
        ORDER BY competencia_inicio DESC
        LIMIT 1;

        IF v_plano_id IS NULL THEN
            v_sem_plano := v_sem_plano + 1;
            CONTINUE;
        END IF;

        FOR v_item IN
            SELECT pi.*
            FROM public.plan_items pi
            JOIN public.plan_services ps ON ps.plan_id = pi.plan_id AND ps.service_id = pi.service_id
            WHERE pi.plan_id = v_plano_id
              AND pi.ativo = true
              AND ps.inclusao IN ('incluido', 'incluido_com_limite')
        LOOP
            IF EXISTS (
                SELECT 1 FROM public.client_checklist_items 
                WHERE client_id = v_empresa.id 
                  AND competencia = _competencia 
                  AND (service_id = v_item.service_id OR titulo = v_item.titulo)
                  AND deleted_at IS NULL
            ) THEN
                v_ignorados := v_ignorados + 1;
            ELSE
                INSERT INTO public.client_checklist_items (
                    client_id,
                    competencia,
                    titulo,
                    descricao,
                    categoria,
                    obrigatorio,
                    exige_documento,
                    visivel_cliente,
                    prazo,
                    status,
                    plan_item_id,
                    plan_id,
                    service_id
                ) VALUES (
                    v_empresa.id,
                    _competencia,
                    v_item.titulo,
                    v_item.descricao,
                    v_item.categoria,
                    v_item.obrigatorio,
                    v_item.exige_documento,
                    v_item.visivel_cliente,
                    CASE 
                        WHEN v_item.prazo_tipo = 'dia_fixo' THEN 
                            CASE WHEN v_item.prazo_valor IS NOT NULL AND v_item.prazo_valor BETWEEN 1 AND 31 
                                 THEN (_competencia || '-' || LPAD(v_item.prazo_valor::text, 2, '0'))::date 
                                 ELSE NULL END
                        WHEN v_item.prazo_tipo = 'ultimo_dia' THEN (date_trunc('month', (_competencia || '-01')::date) + interval '1 month - 1 day')::date
                        WHEN v_item.prazo_tipo = 'dias_apos_competencia' THEN ((_competencia || '-01')::date + (COALESCE(v_item.prazo_valor, 0) || ' days')::interval)::date
                        ELSE NULL
                    END,
                    'pendente',
                    v_item.id,
                    v_plano_id,
                    v_item.service_id
                );
                v_criados := v_criados + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN json_build_object(
        'criados', v_criados,
        'ignorados_existentes', v_ignorados,
        'empresas_sem_plano', v_sem_plano
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_plan_checklist(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_plan_checklist(text) TO service_role;
