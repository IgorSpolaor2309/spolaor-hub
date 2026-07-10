
-- Nova tabela para dados comerciais da empresa (separada por segurança)
CREATE TABLE public.client_commercial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo_cliente text NOT NULL CHECK (tipo_cliente IN ('B2B','B2C','MEI')),
  plano text,
  valor_mensalidade numeric(12,2),
  dia_vencimento smallint CHECK (dia_vencimento BETWEEN 1 AND 31),
  periodicidade text NOT NULL DEFAULT 'mensal' CHECK (periodicidade IN ('mensal','trimestral','semestral','anual')),
  status_comercial text NOT NULL DEFAULT 'ativo' CHECK (status_comercial IN ('ativo','suspenso','encerrado')),
  data_inicio date,
  data_ultimo_reajuste date,
  proximo_reajuste date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_commercial TO authenticated;
GRANT ALL ON public.client_commercial TO service_role;

ALTER TABLE public.client_commercial ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
CREATE POLICY "Commercial: admin all"
  ON public.client_commercial FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Colaborador vinculado: apenas leitura
CREATE POLICY "Commercial: collaborator read"
  ON public.client_commercial FOR SELECT
  USING (
    public.has_role(auth.uid(), 'collaborator')
    AND EXISTS (
      SELECT 1
      FROM public.client_collaborators cc
      JOIN public.collaborators c ON c.id = cc.collaborator_id
      WHERE cc.client_id = client_commercial.client_id
        AND c.user_id = auth.uid()
        AND COALESCE(c.status,'active') = 'active'
    )
  );

-- Trigger updated_at
CREATE TRIGGER trg_client_commercial_updated_at
BEFORE UPDATE ON public.client_commercial
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger para timeline (registra alterações)
CREATE OR REPLACE FUNCTION public.log_client_commercial_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'comercial_criado',
      'Dados comerciais cadastrados',
      jsonb_build_object(
        'tipo_cliente', NEW.tipo_cliente,
        'plano', NEW.plano,
        'valor_mensalidade', NEW.valor_mensalidade,
        'periodicidade', NEW.periodicidade,
        'status_comercial', NEW.status_comercial
      ));
    RETURN NEW;
  END IF;

  IF NEW.tipo_cliente      IS DISTINCT FROM OLD.tipo_cliente      THEN v_changes := v_changes || jsonb_build_object('tipo_cliente', jsonb_build_object('old', OLD.tipo_cliente, 'new', NEW.tipo_cliente)); END IF;
  IF NEW.plano             IS DISTINCT FROM OLD.plano             THEN v_changes := v_changes || jsonb_build_object('plano', jsonb_build_object('old', OLD.plano, 'new', NEW.plano)); END IF;
  IF NEW.valor_mensalidade IS DISTINCT FROM OLD.valor_mensalidade THEN v_changes := v_changes || jsonb_build_object('valor_mensalidade', jsonb_build_object('old', OLD.valor_mensalidade, 'new', NEW.valor_mensalidade)); END IF;
  IF NEW.dia_vencimento    IS DISTINCT FROM OLD.dia_vencimento    THEN v_changes := v_changes || jsonb_build_object('dia_vencimento', jsonb_build_object('old', OLD.dia_vencimento, 'new', NEW.dia_vencimento)); END IF;
  IF NEW.periodicidade     IS DISTINCT FROM OLD.periodicidade     THEN v_changes := v_changes || jsonb_build_object('periodicidade', jsonb_build_object('old', OLD.periodicidade, 'new', NEW.periodicidade)); END IF;
  IF NEW.status_comercial  IS DISTINCT FROM OLD.status_comercial  THEN v_changes := v_changes || jsonb_build_object('status_comercial', jsonb_build_object('old', OLD.status_comercial, 'new', NEW.status_comercial)); END IF;
  IF NEW.data_ultimo_reajuste IS DISTINCT FROM OLD.data_ultimo_reajuste THEN v_changes := v_changes || jsonb_build_object('data_ultimo_reajuste', jsonb_build_object('old', OLD.data_ultimo_reajuste, 'new', NEW.data_ultimo_reajuste)); END IF;

  IF v_changes <> '{}'::jsonb THEN
    IF v_changes ? 'valor_mensalidade' AND v_changes ? 'data_ultimo_reajuste' THEN
      v_desc := 'Reajuste de mensalidade';
    ELSIF v_changes ? 'valor_mensalidade' THEN
      v_desc := 'Alteração de valor da mensalidade';
    ELSIF v_changes ? 'status_comercial' THEN
      v_desc := 'Alteração de status comercial';
    ELSE
      v_desc := 'Dados comerciais atualizados';
    END IF;
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, auth.uid(), 'comercial_atualizado', v_desc, v_changes);
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_client_commercial_log
AFTER INSERT OR UPDATE ON public.client_commercial
FOR EACH ROW EXECUTE FUNCTION public.log_client_commercial_event();
