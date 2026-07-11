
-- =========================================================
-- FASE 2 — PROCESSOS (Bloco 1)
-- =========================================================

-- ---------- process_steps: responsável padrão + tipo de prazo ----------
ALTER TABLE public.process_steps
  ADD COLUMN IF NOT EXISTS responsavel_padrao_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo_tipo text NOT NULL DEFAULT 'abertura'
    CHECK (prazo_tipo IN ('abertura','anterior'));

-- ---------- company_processes: cache de progresso + espera ----------
ALTER TABLE public.company_processes
  ADD COLUMN IF NOT EXISTS total_etapas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS etapas_concluidas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progresso integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_espera text,
  ADD COLUMN IF NOT EXISTS data_conclusao timestamptz,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_company_processes_prazo ON public.company_processes(prazo_final);
CREATE INDEX IF NOT EXISTS idx_company_processes_type ON public.company_processes(process_type_id);

-- ---------- company_process_steps: dados de execução + notif ----------
ALTER TABLE public.company_process_steps
  ADD COLUMN IF NOT EXISTS prazo_tipo text NOT NULL DEFAULT 'abertura'
    CHECK (prazo_tipo IN ('abertura','anterior')),
  ADD COLUMN IF NOT EXISTS prazo_dias integer,
  ADD COLUMN IF NOT EXISTS data_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS concluida_dentro_prazo boolean,
  ADD COLUMN IF NOT EXISTS notif_vence_em_breve_em timestamptz,
  ADD COLUMN IF NOT EXISTS notif_vencida_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_cps_responsavel ON public.company_process_steps(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_cps_prazo ON public.company_process_steps(prazo);

-- =========================================================
-- open_company_process: usa responsável padrão + prazo por tipo
-- =========================================================
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
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'collaborator')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO public.company_processes
    (client_id, process_type_id, responsavel_id, prazo_final, prioridade, observacoes, created_by)
  VALUES
    (_client_id, _process_type_id, _responsavel_id, _prazo_final,
     COALESCE(_prioridade,'media'), _observacoes, auth.uid())
  RETURNING id INTO _new_id;

  INSERT INTO public.company_process_steps (
    company_process_id, process_step_id, nome, descricao, ordem, departamento,
    obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual,
    responsavel_id, prazo, prazo_tipo, prazo_dias
  )
  SELECT
    _new_id, s.id, s.nome, s.descricao, s.ordem, s.departamento,
    s.obrigatoria, s.exige_documento, s.visivel_cliente, s.pode_concluir_manual,
    COALESCE(_responsavel_id, s.responsavel_padrao_id),
    CASE
      WHEN s.prazo_tipo = 'abertura' AND s.prazo_dias IS NOT NULL
        THEN (_hoje + (s.prazo_dias || ' days')::interval)::date
      ELSE NULL
    END,
    s.prazo_tipo,
    s.prazo_dias
  FROM public.process_steps s
  WHERE s.process_type_id = _process_type_id
  ORDER BY s.ordem, s.created_at;

  RETURN _new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_company_process(uuid, uuid, uuid, date, text, text) TO authenticated;

-- =========================================================
-- Recalcula progresso/status de um processo
-- =========================================================
CREATE OR REPLACE FUNCTION public.recalc_company_process(_process_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int; _done int; _in_progress int; _pct int;
  _curr text; _new text; _data_concl timestamptz;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status='concluida'),
    count(*) FILTER (WHERE status='em_andamento')
  INTO _total, _done, _in_progress
  FROM public.company_process_steps
  WHERE company_process_id = _process_id;

  _pct := CASE WHEN _total > 0 THEN LEAST(100, GREATEST(0, ROUND((_done::numeric / _total) * 100)))::int ELSE 0 END;

  SELECT status INTO _curr FROM public.company_processes WHERE id = _process_id;

  -- Não sobrescreve cancelado / aguardando (manuais)
  IF _curr IN ('cancelado','aguardando_cliente','aguardando_orgao') THEN
    _new := _curr;
  ELSIF _total > 0 AND _done = _total THEN
    _new := 'concluido';
  ELSIF _done > 0 OR _in_progress > 0 THEN
    _new := 'em_andamento';
  ELSE
    _new := 'nao_iniciado';
  END IF;

  _data_concl := CASE WHEN _new = 'concluido' THEN
    (SELECT max(data_conclusao) FROM public.company_process_steps WHERE company_process_id = _process_id AND status='concluida')
    ELSE NULL END;

  UPDATE public.company_processes
     SET total_etapas = _total,
         etapas_concluidas = _done,
         progresso = _pct,
         status = _new,
         status_changed_at = CASE WHEN status <> _new THEN now() ELSE status_changed_at END,
         data_conclusao = _data_concl,
         updated_at = now()
   WHERE id = _process_id;
END;
$$;

-- =========================================================
-- helper: papel textual do usuário atual (para auditoria)
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_actor_role()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid := auth.uid();
BEGIN
  IF u IS NULL THEN RETURN 'system'; END IF;
  IF public.is_admin(u) THEN RETURN 'admin'; END IF;
  IF public.has_role(u,'collaborator') THEN RETURN 'collaborator'; END IF;
  RETURN 'client';
END $$;

-- =========================================================
-- Trigger: eventos + notificações de company_process_steps
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
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT cp.client_id, pt.nome
    INTO _client, _tipo_nome
    FROM public.company_processes cp
    JOIN public.process_types pt ON pt.id = cp.process_type_id
   WHERE cp.id = _proc;

  IF TG_OP = 'INSERT' THEN
    -- notifica responsável atribuído (se não for o próprio usuário)
    IF NEW.responsavel_id IS NOT NULL AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.notify_user(NEW.responsavel_id, 'processo',
        'Etapa atribuída — '||public.client_label(_client),
        COALESCE(_tipo_nome,'Processo')||' · '||NEW.nome,
        '/processos/'||_proc);
    END IF;
    PERFORM public.recalc_company_process(_proc);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_company_process(_proc);
    RETURN OLD;
  END IF;

  -- UPDATE
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- start
    IF NEW.status = 'em_andamento' AND OLD.status <> 'em_andamento' AND NEW.data_inicio IS NULL THEN
      NEW.data_inicio := now();
    END IF;
    -- conclusão
    IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
      IF NEW.data_conclusao IS NULL THEN NEW.data_conclusao := now(); END IF;
      IF NEW.concluida_por IS NULL THEN NEW.concluida_por := _uid; END IF;
      IF NEW.data_inicio IS NULL THEN NEW.data_inicio := COALESCE(OLD.data_inicio, now()); END IF;
      NEW.concluida_dentro_prazo := CASE
        WHEN NEW.prazo IS NULL THEN NULL
        ELSE (NEW.data_conclusao::date <= NEW.prazo)
      END;

      -- calcula prazo da próxima etapa dependente da anterior
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
    -- reset notif ao trocar responsável para permitir novo aviso de vencimento
    NEW.notif_vence_em_breve_em := NULL;
    NEW.notif_vencida_em := NULL;
  END IF;

  IF NEW.prazo IS DISTINCT FROM OLD.prazo THEN
    INSERT INTO public.timeline_events (client_id, actor_profile_id, tipo, descricao, metadata)
    VALUES (_client, _uid, 'processo_etapa_prazo',
      'Prazo de "'||NEW.nome||'" alterado',
      jsonb_build_object('process_id', _proc, 'step_id', NEW.id,
        'old', OLD.prazo, 'new', NEW.prazo, 'origem_ator', _role));
    -- reset dedup para novo prazo
    NEW.notif_vence_em_breve_em := NULL;
    NEW.notif_vencida_em := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cps_event ON public.company_process_steps;
CREATE TRIGGER trg_cps_event
  BEFORE INSERT OR UPDATE OR DELETE ON public.company_process_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_company_process_steps_event();

-- Segundo trigger AFTER: recalcula progresso após qualquer mudança
CREATE OR REPLACE FUNCTION public.tg_company_process_steps_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_company_process(COALESCE(NEW.company_process_id, OLD.company_process_id));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cps_recalc ON public.company_process_steps;
CREATE TRIGGER trg_cps_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.company_process_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_company_process_steps_recalc();

-- =========================================================
-- Trigger: eventos + notificações de company_processes
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
      IF NEW.status = 'concluido' AND OLD.status <> 'concluido' AND NEW.responsavel_id IS NOT NULL
         AND NEW.responsavel_id <> COALESCE(_uid,'00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.notify_user(NEW.responsavel_id, 'processo',
          'Processo concluído — '||public.client_label(NEW.client_id),
          COALESCE(_tipo_nome,'Processo'), '/processos/'||NEW.id);
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
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_cp_event ON public.company_processes;
CREATE TRIGGER trg_cp_event
  AFTER INSERT OR UPDATE ON public.company_processes
  FOR EACH ROW EXECUTE FUNCTION public.tg_company_processes_event();

-- =========================================================
-- Cron: notificações de vencimento de etapas (usada pelo Bloco 2)
-- =========================================================
CREATE OR REPLACE FUNCTION public.processos_notificar_vencimentos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _limite date := _hoje + 3;
  _breve int := 0; _venc int := 0;
  r record;
BEGIN
  -- vence em breve (3 dias)
  FOR r IN
    SELECT s.id, s.company_process_id, s.nome, s.responsavel_id, s.prazo,
           cp.client_id, pt.nome AS tipo_nome
      FROM public.company_process_steps s
      JOIN public.company_processes cp ON cp.id = s.company_process_id
      JOIN public.process_types pt ON pt.id = cp.process_type_id
     WHERE s.status IN ('pendente','em_andamento')
       AND s.responsavel_id IS NOT NULL
       AND s.prazo IS NOT NULL
       AND s.prazo BETWEEN _hoje AND _limite
       AND s.notif_vence_em_breve_em IS NULL
       AND cp.status NOT IN ('cancelado','concluido')
  LOOP
    PERFORM public.notify_user(r.responsavel_id, 'processo',
      'Etapa vence em breve — '||public.client_label(r.client_id),
      COALESCE(r.tipo_nome,'Processo')||' · '||r.nome||' · até '||to_char(r.prazo,'DD/MM/YYYY'),
      '/processos/'||r.company_process_id);
    UPDATE public.company_process_steps SET notif_vence_em_breve_em = now() WHERE id = r.id;
    _breve := _breve + 1;
  END LOOP;

  -- vencidas (uma única vez por etapa/prazo)
  FOR r IN
    SELECT s.id, s.company_process_id, s.nome, s.responsavel_id, s.prazo,
           cp.client_id, pt.nome AS tipo_nome
      FROM public.company_process_steps s
      JOIN public.company_processes cp ON cp.id = s.company_process_id
      JOIN public.process_types pt ON pt.id = cp.process_type_id
     WHERE s.status IN ('pendente','em_andamento')
       AND s.responsavel_id IS NOT NULL
       AND s.prazo IS NOT NULL
       AND s.prazo < _hoje
       AND s.notif_vencida_em IS NULL
       AND cp.status NOT IN ('cancelado','concluido')
  LOOP
    PERFORM public.notify_user(r.responsavel_id, 'processo',
      'Etapa vencida — '||public.client_label(r.client_id),
      COALESCE(r.tipo_nome,'Processo')||' · '||r.nome||' · era '||to_char(r.prazo,'DD/MM/YYYY'),
      '/processos/'||r.company_process_id);
    UPDATE public.company_process_steps SET notif_vencida_em = now() WHERE id = r.id;
    _venc := _venc + 1;
  END LOOP;

  RETURN jsonb_build_object('vence_em_breve', _breve, 'vencidas', _venc, 'data', _hoje);
END $$;

GRANT EXECUTE ON FUNCTION public.processos_notificar_vencimentos() TO service_role;

-- =========================================================
-- Backfill: total/etapas/progresso para processos existentes
-- =========================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.company_processes LOOP
    PERFORM public.recalc_company_process(r.id);
  END LOOP;
END $$;
