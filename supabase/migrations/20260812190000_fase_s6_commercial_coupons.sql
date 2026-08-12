-- FASE S6: Cupons e Contratação Comercial Detalhada

DO $$ BEGIN
    CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.coupon_apply_to AS ENUM ('all', 'specific_plans', 'specific_services');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Cupons
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    discount_type public.discount_type NOT NULL,
    discount_value NUMERIC NOT NULL,
    max_discount NUMERIC, -- Teto para %
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    max_uses_per_client INTEGER DEFAULT 1,
    apply_to public.coupon_apply_to NOT NULL DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Colaboradores can view coupons" ON public.coupons FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'user'));

-- 2. Alvos do Cupom
CREATE TABLE IF NOT EXISTS public.coupon_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('plan', 'service')),
    target_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_targets TO authenticated;
GRANT ALL ON public.coupon_targets TO service_role;
ALTER TABLE public.coupon_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupon targets" ON public.coupon_targets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Colaboradores can view coupon targets" ON public.coupon_targets FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'moderator') OR public.has_role(auth.uid(), 'user'));

-- 3. Extensão client_commercial (Rastreabilidade)
ALTER TABLE public.client_commercial 
ADD COLUMN IF NOT EXISTS original_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS commercial_notes TEXT;

-- 4. Serviços extras vinculados à contratação ativa
CREATE TABLE IF NOT EXISTS public.client_contract_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    valor_acordado NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(client_id, service_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contract_services TO authenticated;
GRANT ALL ON public.client_contract_services TO service_role;
ALTER TABLE public.client_contract_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client contract services" ON public.client_contract_services FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Colaboradores can view/manage contract services" ON public.client_contract_services FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'moderator'));

-- 5. Histórico de cupons aplicados por empresa
CREATE TABLE IF NOT EXISTS public.client_contract_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(client_id, coupon_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contract_coupons TO authenticated;
GRANT ALL ON public.client_contract_coupons TO service_role;
ALTER TABLE public.client_contract_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage client contract coupons" ON public.client_contract_coupons FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 6. RPC de Validação de Cupom
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code TEXT, p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon RECORD;
    v_usage_total INTEGER;
    v_usage_client INTEGER;
BEGIN
    SELECT * INTO v_coupon FROM public.coupons WHERE code = p_code AND status = 'active';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Cupom inválido ou inativo');
    END IF;

    -- Datas
    IF (v_coupon.start_date IS NOT NULL AND now() < v_coupon.start_date) THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Este cupom ainda não é válido');
    END IF;
    IF (v_coupon.end_date IS NOT NULL AND now() > v_coupon.end_date) THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Este cupom expirou');
    END IF;

    -- Limites globais
    SELECT COUNT(*)::INTEGER INTO v_usage_total FROM public.client_contract_coupons WHERE coupon_id = v_coupon.id;
    IF (v_coupon.max_uses IS NOT NULL AND v_usage_total >= v_coupon.max_uses) THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Limite total de usos atingido');
    END IF;

    -- Limite por cliente
    SELECT COUNT(*)::INTEGER INTO v_usage_client FROM public.client_contract_coupons WHERE coupon_id = v_coupon.id AND client_id = p_client_id;
    IF (v_coupon.max_uses_per_client IS NOT NULL AND v_usage_client >= v_coupon.max_uses_per_client) THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Você já atingiu o limite de usos para este cupom');
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'coupon_id', v_coupon.id,
        'discount_type', v_coupon.discount_type,
        'discount_value', v_coupon.discount_value,
        'max_discount', v_coupon.max_discount,
        'apply_to', v_coupon.apply_to
    );
END;
$$;
