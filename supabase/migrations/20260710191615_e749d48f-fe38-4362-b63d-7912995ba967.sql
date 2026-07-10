
-- ============================================================
-- 1) Extensões
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- 2) Log de execuções do cron
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plan_checklist_cron_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamptz NOT NULL DEFAULT now(),
  competencia text NOT NULL,
  origem text NOT NULL DEFAULT 'cron', -- cron | manual
  criados int NOT NULL DEFAULT 0,
  ignorados_existentes int NOT NULL DEFAULT 0,
  empresas_sem_plano int NOT NULL DEFAULT 0,
  empresas_processadas int NOT NULL DEFAULT 0,
  erro text
);

GRANT SELECT ON public.plan_checklist_cron_log TO authenticated;
GRANT ALL    ON public.plan_checklist_cron_log TO service_role;

ALTER TABLE public.plan_checklist_cron_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cron_log_admin_read" ON public.plan_checklist_cron_log;
CREATE POLICY "cron_log_admin_read"
  ON public.plan_checklist_cron_log FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============================================================
-- 3) Vínculo direto documento → item do checklist
-- ============================================================
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS checklist_item_id uuid
    REFERENCES public.client_checklist_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_checklist_item
  ON public.documents(checklist_item_id)
  WHERE checklist_item_id IS NOT NULL;

-- ============================================================
-- 4) Trigger de insert de documento — vínculo explícito primeiro,
--    match por competência somente se houver EXATAMENTE 1 pendente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.checklist_on_document_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_match_count int;
  v_match_id uuid;
BEGIN
  -- 4a) Vínculo explícito via checklist_item_id
  IF NEW.checklist_item_id IS NOT NULL THEN
    UPDATE public.client_checklist_items ci
       SET status       = 'recebido',
           document_id  = COALESCE(ci.document_id, NEW.id),
           received_at  = COALESCE(ci.received_at, now())
     WHERE ci.id = NEW.checklist_item_id
       AND ci.client_id = NEW.client_id
       AND ci.deleted_at IS NULL
       AND ci.status = 'pendente';

    FOR v_user IN
      SELECT DISTINCT responsavel_profile_id FROM public.client_checklist_items
       WHERE id = NEW.checklist_item_id AND responsavel_profile_id IS NOT NULL
    LOOP
      PERFORM public.notify_user(v_user, 'checklist',
        'Documento recebido — '||public.client_label(NEW.client_id),
        COALESCE(NEW.nome,'Novo arquivo'),'/checklist');
    END LOOP;
    RETURN NEW;
  END IF;

  -- 4b) Match por competência: só quando há EXATAMENTE 1 item pendente compatível
  IF NEW.competencia IS NOT NULL THEN
    SELECT count(*), min(ci.id) INTO v_match_count, v_match_id
      FROM public.client_checklist_items ci
     WHERE ci.client_id = NEW.client_id
       AND ci.status = 'pendente'
       AND ci.deleted_at IS NULL
       AND ci.document_request_id IS NULL
       AND ci.competencia = NEW.competencia;

    IF v_match_count = 1 THEN
      UPDATE public.client_checklist_items ci
         SET status      = 'recebido',
             document_id = COALESCE(ci.document_id, NEW.id),
             received_at = COALESCE(ci.received_at, now())
       WHERE ci.id = v_match_id;

      FOR v_user IN
        SELECT DISTINCT responsavel_profile_id FROM public.client_checklist_items
         WHERE id = v_match_id AND responsavel_profile_id IS NOT NULL
      LOOP
        PERFORM public.notify_user(v_user, 'checklist',
          'Documento recebido — '||public.client_label(NEW.client_id),
          COALESCE(NEW.nome,'Novo arquivo'),'/checklist');
      END LOOP;
    END IF;
    -- Ambíguo (0 ou >1): não altera nada.
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5) Rotina automática diária: gera checklist da competência atual
-- ============================================================
CREATE OR REPLACE FUNCTION public.cron_generate_current_plan_checklist()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_comp text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_result jsonb;
  v_processadas int;
  v_erro text;
BEGIN
  SELECT count(*) INTO v_processadas
    FROM public.clients c
    LEFT JOIN public.client_commercial cc ON cc.client_id = c.id
   WHERE c.deleted_at IS NULL
     AND COALESCE(c.status,'active') <> 'inactive'
     AND cc.plan_id IS NOT NULL;

  BEGIN
    v_result := public.generate_plan_checklist(v_comp);
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM;
    INSERT INTO public.plan_checklist_cron_log
      (competencia, origem, empresas_processadas, erro)
    VALUES (v_comp, 'cron', v_processadas, v_erro);
    RAISE;
  END;

  INSERT INTO public.plan_checklist_cron_log
    (competencia, origem, empresas_processadas,
     criados, ignorados_existentes, empresas_sem_plano)
  VALUES (
    v_comp, 'cron', v_processadas,
    COALESCE((v_result->>'criados')::int, 0),
    COALESCE((v_result->>'ignorados_existentes')::int, 0),
    COALESCE((v_result->>'empresas_sem_plano')::int, 0)
  );

  RETURN v_result;
END;
$$;

-- ============================================================
-- 6) Agendamento diário 03:00 (America/Sao_Paulo ≈ 06:00 UTC)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'plan_checklist_daily') THEN
    PERFORM cron.unschedule('plan_checklist_daily');
  END IF;
  PERFORM cron.schedule(
    'plan_checklist_daily',
    '0 6 * * *',
    $cron$SELECT public.cron_generate_current_plan_checklist();$cron$
  );
END $$;
