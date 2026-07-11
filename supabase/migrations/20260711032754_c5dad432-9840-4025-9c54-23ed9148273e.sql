
CREATE TABLE public.process_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text,
  descricao text,
  cor text,
  icone text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_types TO authenticated;
GRANT ALL ON public.process_types TO service_role;
ALTER TABLE public.process_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "process_types read staff" ON public.process_types FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'));
CREATE POLICY "process_types write admin" ON public.process_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_process_types_updated BEFORE UPDATE ON public.process_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type_id uuid NOT NULL REFERENCES public.process_types(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  departamento text,
  prazo_dias integer,
  obrigatoria boolean NOT NULL DEFAULT true,
  exige_documento boolean NOT NULL DEFAULT false,
  visivel_cliente boolean NOT NULL DEFAULT false,
  pode_concluir_manual boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.process_steps TO authenticated;
GRANT ALL ON public.process_steps TO service_role;
ALTER TABLE public.process_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "process_steps read staff" ON public.process_steps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'));
CREATE POLICY "process_steps write admin" ON public.process_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_process_steps_type ON public.process_steps(process_type_id, ordem);
CREATE TRIGGER trg_process_steps_updated BEFORE UPDATE ON public.process_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.company_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  process_type_id uuid NOT NULL REFERENCES public.process_types(id) ON DELETE RESTRICT,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_abertura date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  prazo_final date,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  status text NOT NULL DEFAULT 'nao_iniciado'
    CHECK (status IN ('nao_iniciado','em_andamento','aguardando_cliente','aguardando_orgao','concluido','cancelado')),
  observacoes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_processes TO authenticated;
GRANT ALL ON public.company_processes TO service_role;
ALTER TABLE public.company_processes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_processes read staff" ON public.company_processes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'));
CREATE POLICY "company_processes write staff" ON public.company_processes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'));
CREATE INDEX idx_company_processes_client ON public.company_processes(client_id);
CREATE INDEX idx_company_processes_status ON public.company_processes(status);
CREATE INDEX idx_company_processes_resp ON public.company_processes(responsavel_id);
CREATE TRIGGER trg_company_processes_updated BEFORE UPDATE ON public.company_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.company_process_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_process_id uuid NOT NULL REFERENCES public.company_processes(id) ON DELETE CASCADE,
  process_step_id uuid REFERENCES public.process_steps(id) ON DELETE SET NULL,
  nome text NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  departamento text,
  obrigatoria boolean NOT NULL DEFAULT true,
  exige_documento boolean NOT NULL DEFAULT false,
  visivel_cliente boolean NOT NULL DEFAULT false,
  pode_concluir_manual boolean NOT NULL DEFAULT true,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prazo date,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
  data_conclusao timestamptz,
  concluida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_process_steps TO authenticated;
GRANT ALL ON public.company_process_steps TO service_role;
ALTER TABLE public.company_process_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_process_steps read staff" ON public.company_process_steps FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'));
CREATE POLICY "company_process_steps write staff" ON public.company_process_steps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator'));
CREATE INDEX idx_cps_process ON public.company_process_steps(company_process_id, ordem);
CREATE INDEX idx_cps_status ON public.company_process_steps(status);
CREATE TRIGGER trg_cps_updated BEFORE UPDATE ON public.company_process_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.open_company_process(
  _client_id uuid,
  _process_type_id uuid,
  _responsavel_id uuid DEFAULT NULL,
  _prazo_final date DEFAULT NULL,
  _prioridade text DEFAULT 'media',
  _observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.company_processes (client_id, process_type_id, responsavel_id, prazo_final, prioridade, observacoes, created_by)
  VALUES (_client_id, _process_type_id, _responsavel_id, _prazo_final, COALESCE(_prioridade,'media'), _observacoes, auth.uid())
  RETURNING id INTO _new_id;

  INSERT INTO public.company_process_steps (
    company_process_id, process_step_id, nome, descricao, ordem, departamento,
    obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
    responsavel_id, prazo
  )
  SELECT
    _new_id, s.id, s.nome, s.descricao, s.ordem, s.departamento,
    s.obrigatoria, s.exige_documento, s.visivel_cliente, s.pode_concluir_manual,
    _responsavel_id,
    CASE WHEN s.prazo_dias IS NOT NULL
      THEN ((now() AT TIME ZONE 'America/Sao_Paulo')::date + (s.prazo_dias || ' days')::interval)::date
      ELSE NULL END
  FROM public.process_steps s
  WHERE s.process_type_id = _process_type_id
  ORDER BY s.ordem, s.created_at;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_company_process(uuid, uuid, uuid, date, text, text) TO authenticated;
