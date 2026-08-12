-- FASE S4 — Geração automática de checklist baseada em planos

-- 1. Adicionar colunas de rastreabilidade se não existirem
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_checklist_items' AND column_name = 'plan_id') THEN
        ALTER TABLE public.client_checklist_items ADD COLUMN plan_id uuid REFERENCES public.plans(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_checklist_items' AND column_name = 'service_id') THEN
        ALTER TABLE public.client_checklist_items ADD COLUMN service_id uuid REFERENCES public.services(id);
    END IF;
END $$;

-- 2. RPC para gerar checklist baseado em planos
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
    -- Validar formato da competência
    IF _competencia !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
        RAISE EXCEPTION 'Formato de competência inválido: %. Use AAAA-MM', _competencia;
    END IF;

    -- Iterar sobre todas as empresas ativas que não estão deletadas
    FOR v_empresa IN 
        SELECT id, razao_social 
        FROM public.clients 
        WHERE status = 'active' AND deleted_at IS NULL
    LOOP
        -- Buscar o plano vigente da empresa para esta competência
        -- Usando a lógica da RPC get_plan_for_competence inline ou similar
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

        -- Buscar itens do plano que estão vinculados a serviços INCLUÍDOS
        FOR v_item IN
            SELECT pi.*
            FROM public.plan_items pi
            JOIN public.plan_services ps ON ps.plan_id = pi.plan_id AND ps.service_id = pi.service_id
            WHERE pi.plan_id = v_plano_id
              AND pi.ativo = true
              AND ps.inclusao IN ('incluido', 'incluido_com_limite')
        LOOP
            -- Verificar se o item já existe para esta empresa/competência/serviço para evitar duplicidade
            -- A unicidade é baseada em (client_id, competencia, service_id) se service_id existir, 
            -- ou no titulo se for item manual legado (não é o caso aqui).
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
                        WHEN v_item.prazo_tipo = 'dia_fixo' THEN (_competencia || '-' || LPAD(v_item.prazo_valor::text, 2, '0'))::date
                        WHEN v_item.prazo_tipo = 'ultimo_dia' THEN (date_trunc('month', (_competencia || '-01')::date) + interval '1 month - 1 day')::date
                        WHEN v_item.prazo_tipo = 'dias_apos_competencia' THEN ((_competencia || '-01')::date + (v_item.prazo_valor || ' days')::interval)::date
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

