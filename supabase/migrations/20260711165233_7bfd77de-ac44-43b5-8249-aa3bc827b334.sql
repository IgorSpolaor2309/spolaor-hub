
CREATE OR REPLACE FUNCTION public.open_company_process(
  _client_id uuid,
  _process_type_id uuid,
  _responsavel_id uuid DEFAULT NULL,
  _prazo_final date DEFAULT NULL,
  _prioridade text DEFAULT 'media',
  _observacoes text DEFAULT NULL,
  _is_demo boolean DEFAULT false,
  _demo_batch_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.company_processes
    (client_id, process_type_id, responsavel_id, prazo_final, prioridade, observacoes, created_by,
     is_demo, demo_batch_id)
  VALUES
    (_client_id, _process_type_id, _responsavel_id, _prazo_final,
     COALESCE(_prioridade,'media'), _observacoes, auth.uid(),
     COALESCE(_is_demo, false), _demo_batch_id)
  RETURNING id INTO _new_id;

  WITH inserted_steps AS (
    INSERT INTO public.company_process_steps (
      company_process_id, process_step_id, nome, descricao, ordem, departamento,
      obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
      responsavel_id, prazo, prazo_tipo, prazo_dias,
      nome_publico, descricao_publica, observacao_publica,
      is_demo, demo_batch_id
    )
    SELECT _new_id, s.id, s.nome, s.descricao, s.ordem, s.departamento,
           s.obrigatoria, s.exige_documento, COALESCE(s.visivel_cliente,false), s.pode_concluir_manual,
           COALESCE(_responsavel_id, s.responsavel_padrao_id),
           CASE WHEN s.prazo_tipo='abertura' AND s.prazo_dias IS NOT NULL
                THEN (_hoje + (s.prazo_dias||' days')::interval)::date ELSE NULL END,
           s.prazo_tipo, s.prazo_dias,
           s.nome_publico, s.descricao_publica, s.observacao_publica,
           COALESCE(_is_demo, false), _demo_batch_id
      FROM public.process_steps s
     WHERE s.process_type_id = _process_type_id
     ORDER BY s.ordem, s.created_at
    RETURNING id, process_step_id
  )
  INSERT INTO public.company_process_step_requirements
    (company_process_step_id, source_requirement_id, nome, descricao, observacao,
     obrigatorio, ordem, visivel_cliente, nome_publico, descricao_publica)
  SELECT ins.id, r.id, r.nome, r.descricao, r.observacao,
         r.obrigatorio, r.ordem, COALESCE(r.visivel_cliente,false),
         r.nome_publico, r.descricao_publica
    FROM inserted_steps ins
    JOIN public.process_step_requirements r ON r.process_step_id = ins.process_step_id
   ORDER BY r.ordem;

  RETURN _new_id;
END $function$;
