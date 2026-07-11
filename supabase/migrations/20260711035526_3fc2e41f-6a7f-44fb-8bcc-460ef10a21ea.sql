
-- =========================================================
-- Substitui trigger de company_processes: exige motivo, notifica prazo/espera
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_company_processes_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tipo_nome text;
  _uid uuid := auth.uid();
  _role text := public.current_actor_role();
BEGIN
  SELECT nome INTO _tipo_nome FROM public.process_types WHERE id = COALESCE(NEW.process_type_id, OLD.process_type_id);

  -- Validação: motivo obrigatório para status de espera (BEFORE seria ideal, mas mantemos AFTER e usamos RAISE — não altera trigger timing)
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status IN ('aguardando_cliente','aguardando_orgao') THEN
    IF NEW.motivo_espera IS NULL OR btrim(NEW.motivo_espera) = '' THEN
      RAISE EXCEPTION 'É obrigatório informar o motivo da espera ao usar o status "%".', NEW.status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (NEW.client_id, _uid, 'processo_aberto',
      'Processo aberto: '||COALESCE(_tipo_nome,'—'),
      jsonb_build_object('process_id', NEW.id, 'process_type_id', NEW.process_type_id,
        'prioridade', NEW.prioridade, 'origem_ator', _role));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, _uid, 'processo_status',
        'Status do processo → '||NEW.status,
        jsonb_build_object('process_id', NEW.id,
          'old', OLD.status, 'new', NEW.status,
          'motivo_espera', NEW.motivo_espera, 'origem_ator', _role));

      -- notificação de conclusão
      IF NEW.status = 'concluido' AND OLD.status <> 'concluido' AND NEW.responsavel_id IS NOT NULL
         AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(NEW.responsavel_id, 'processo',
          'Processo concluído — '||public.client_label(NEW.client_id),
          COALESCE(_tipo_nome,'Processo'), '/processos/'||NEW.id);
      END IF;

      -- notificação de espera (novo)
      IF NEW.status IN ('aguardando_cliente','aguardando_orgao')
         AND OLD.status NOT IN ('aguardando_cliente','aguardando_orgao')
         AND NEW.responsavel_id IS NOT NULL
         AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(NEW.responsavel_id, 'processo',
          'Processo em espera — '||public.client_label(NEW.client_id),
          COALESCE(_tipo_nome,'Processo')||' · '||COALESCE(NEW.motivo_espera,'sem motivo informado'),
          '/processos/'||NEW.id);
      END IF;
    END IF;

    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, _uid, 'processo_responsavel',
        'Responsável do processo alterado',
        jsonb_build_object('process_id', NEW.id,
          'old', OLD.responsavel_id, 'new', NEW.responsavel_id, 'origem_ator', _role));
      IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(NEW.responsavel_id, 'processo',
          'Processo atribuído — '||public.client_label(NEW.client_id),
          COALESCE(_tipo_nome,'Processo'), '/processos/'||NEW.id);
      END IF;
    END IF;

    IF NEW.prazo_final IS DISTINCT FROM OLD.prazo_final THEN
      INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
      VALUES (NEW.client_id, _uid, 'processo_prazo',
        'Prazo final alterado',
        jsonb_build_object('process_id', NEW.id,
          'old', OLD.prazo_final, 'new', NEW.prazo_final, 'origem_ator', _role));

      -- notificação de prazo (novo): só se houver responsável e não for o próprio ator
      IF NEW.responsavel_id IS NOT NULL
         AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid)
         AND NEW.status NOT IN ('concluido','cancelado') THEN
        PERFORM public.notify_user(NEW.responsavel_id, 'processo',
          'Prazo alterado — '||public.client_label(NEW.client_id),
          COALESCE(_tipo_nome,'Processo')||' · novo prazo '||COALESCE(to_char(NEW.prazo_final,'DD/MM/YYYY'),'—'),
          '/processos/'||NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- =========================================================
-- Atualiza trigger de etapas: notifica reabertura
-- (mantém tudo já implementado; adiciona bloco de notificação de reabertura)
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_company_process_steps_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client uuid;
  _proc uuid := COALESCE(NEW.company_process_id, OLD.company_process_id);
  _tipo_nome text;
  _uid uuid := auth.uid();
  _role text := public.current_actor_role();
  _next record;
BEGIN
  SELECT cp.client_id, pt.nome
    INTO _client, _tipo_nome
    FROM public.company_processes cp
    JOIN public.process_types pt ON pt.id = cp.process_type_id
   WHERE cp.id = _proc;

  IF TG_OP = 'INSERT' THEN
    IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.notify_user(NEW.responsavel_id, 'processo',
        'Etapa atribuída — '||public.client_label(_client),
        COALESCE(_tipo_nome,'Processo')||' · '||NEW.nome,
        '/processos/'||_proc);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'em_andamento' AND OLD.status <> 'em_andamento' AND NEW.data_inicio IS NULL THEN
      NEW.data_inicio := now();
    END IF;

    IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
      IF NEW.data_conclusao IS NULL THEN NEW.data_conclusao := now(); END IF;
      IF NEW.concluida_por IS NULL THEN NEW.concluida_por := _uid; END IF;
      IF NEW.data_inicio IS NULL THEN NEW.data_inicio := COALESCE(OLD.data_inicio, now()); END IF;
      NEW.concluida_dentro_prazo := CASE
        WHEN NEW.prazo IS NULL THEN NULL
        ELSE (NEW.data_conclusao::date <= NEW.prazo)
      END;

      SELECT * INTO _next FROM public.company_process_steps
       WHERE company_process_id = _proc AND ordem > NEW.ordem
       ORDER BY ordem, created_at LIMIT 1;
      IF FOUND AND _next.prazo IS NULL AND _next.prazo_tipo = 'anterior' AND _next.prazo_dias IS NOT NULL THEN
        UPDATE public.company_process_steps
           SET prazo = ((NEW.data_conclusao AT TIME ZONE 'America/Sao_Paulo')::date + (_next.prazo_dias || ' days')::interval)::date
         WHERE id = _next.id;
      END IF;
    END IF;

    -- reabertura
    IF NEW.status <> 'concluida' AND OLD.status = 'concluida' THEN
      NEW.data_conclusao := NULL;
      NEW.concluida_por := NULL;
      NEW.concluida_dentro_prazo := NULL;
      -- notificação de reabertura (novo)
      IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(NEW.responsavel_id, 'processo',
          'Etapa reaberta — '||public.client_label(_client),
          COALESCE(_tipo_nome,'Processo')||' · '||NEW.nome,
          '/processos/'||_proc);
      END IF;
    END IF;

    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (_client, _uid, 'processo_etapa_status',
      'Etapa "'||NEW.nome||'" → '||NEW.status,
      jsonb_build_object('process_id', _proc, 'step_id', NEW.id,
        'old', OLD.status, 'new', NEW.status, 'origem_ator', _role));
  END IF;

  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (_client, _uid, 'processo_etapa_responsavel',
      'Responsável de "'||NEW.nome||'" alterado',
      jsonb_build_object('process_id', _proc, 'step_id', NEW.id,
        'old', OLD.responsavel_id, 'new', NEW.responsavel_id, 'origem_ator', _role));
    IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.notify_user(NEW.responsavel_id, 'processo',
        'Etapa atribuída — '||public.client_label(_client),
        COALESCE(_tipo_nome,'Processo')||' · '||NEW.nome,
        '/processos/'||_proc);
    END IF;
    NEW.notif_vence_em_breve_em := NULL;
    NEW.notif_vencida_em := NULL;
  END IF;

  IF NEW.prazo IS DISTINCT FROM OLD.prazo THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (_client, _uid, 'processo_etapa_prazo',
      'Prazo de "'||NEW.nome||'" alterado',
      jsonb_build_object('process_id', _proc, 'step_id', NEW.id,
        'old', OLD.prazo, 'new', NEW.prazo, 'origem_ator', _role));
    NEW.notif_vence_em_breve_em := NULL;
    NEW.notif_vencida_em := NULL;
  END IF;

  RETURN NEW;
END $$;

-- =========================================================
-- Indicadores agregados de processos
-- =========================================================
CREATE OR REPLACE FUNCTION public.processos_indicadores()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _res jsonb;
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH cp AS (
    SELECT * FROM public.company_processes
  ),
  totais AS (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status NOT IN ('concluido','cancelado'))::int AS abertos,
      count(*) FILTER (WHERE status = 'concluido')::int AS concluidos,
      count(*) FILTER (WHERE status = 'cancelado')::int AS cancelados,
      count(*) FILTER (WHERE status IN ('aguardando_cliente','aguardando_orgao'))::int AS aguardando,
      count(*) FILTER (WHERE status = 'em_andamento')::int AS em_andamento,
      count(*) FILTER (WHERE status NOT IN ('concluido','cancelado') AND prazo_final IS NOT NULL AND prazo_final < _hoje)::int AS vencidos,
      count(*) FILTER (WHERE status NOT IN ('concluido','cancelado') AND prazo_final = _hoje)::int AS hoje,
      count(*) FILTER (WHERE status NOT IN ('concluido','cancelado') AND prazo_final BETWEEN _hoje + 1 AND _hoje + 3)::int AS em_breve,
      COALESCE(round(avg(EXTRACT(EPOCH FROM (data_conclusao - created_at)) / 86400.0)
        FILTER (WHERE status = 'concluido' AND data_conclusao IS NOT NULL))::numeric, 0)::float AS tempo_medio_dias
    FROM cp
  ),
  sla AS (
    SELECT
      count(*) FILTER (WHERE concluida_dentro_prazo IS NOT NULL)::int AS total_avaliadas,
      count(*) FILTER (WHERE concluida_dentro_prazo = true)::int AS dentro_prazo
    FROM public.company_process_steps
    WHERE status = 'concluida'
  ),
  por_resp AS (
    SELECT cp.responsavel_id,
           p.full_name,
           count(*)::int AS total,
           count(*) FILTER (WHERE cp.status NOT IN ('concluido','cancelado'))::int AS abertos,
           count(*) FILTER (WHERE cp.status = 'concluido')::int AS concluidos,
           count(*) FILTER (WHERE cp.status NOT IN ('concluido','cancelado') AND cp.prazo_final IS NOT NULL AND cp.prazo_final < _hoje)::int AS vencidos
      FROM cp
      LEFT JOIN public.profiles p ON p.id = cp.responsavel_id
     GROUP BY cp.responsavel_id, p.full_name
     ORDER BY total DESC
  ),
  por_tipo AS (
    SELECT cp.process_type_id,
           pt.nome,
           pt.cor,
           count(*)::int AS total,
           count(*) FILTER (WHERE cp.status NOT IN ('concluido','cancelado'))::int AS abertos,
           count(*) FILTER (WHERE cp.status = 'concluido')::int AS concluidos,
           count(*) FILTER (WHERE cp.status NOT IN ('concluido','cancelado') AND cp.prazo_final IS NOT NULL AND cp.prazo_final < _hoje)::int AS vencidos
      FROM cp
      JOIN public.process_types pt ON pt.id = cp.process_type_id
     GROUP BY cp.process_type_id, pt.nome, pt.cor
     ORDER BY total DESC
  )
  SELECT jsonb_build_object(
    'totais', (SELECT to_jsonb(t.*) FROM totais t),
    'sla', (SELECT jsonb_build_object(
              'total_etapas_avaliadas', s.total_avaliadas,
              'dentro_prazo', s.dentro_prazo,
              'percentual', CASE WHEN s.total_avaliadas > 0
                THEN round((s.dentro_prazo::numeric / s.total_avaliadas) * 100)::int ELSE NULL END
            ) FROM sla s),
    'por_responsavel', COALESCE((SELECT jsonb_agg(to_jsonb(r.*)) FROM por_resp r), '[]'::jsonb),
    'por_tipo', COALESCE((SELECT jsonb_agg(to_jsonb(t.*)) FROM por_tipo t), '[]'::jsonb)
  ) INTO _res;

  RETURN _res;
END $$;

GRANT EXECUTE ON FUNCTION public.processos_indicadores() TO authenticated;
