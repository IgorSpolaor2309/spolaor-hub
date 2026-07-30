DO $$
DECLARE
  v_count bigint;
  v_dep record;
BEGIN
  IF to_regclass('public.interactions') IS NULL THEN
    RAISE NOTICE 'public.interactions já não existe; nada a fazer.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.interactions' INTO v_count;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Abortado: public.interactions contém % registro(s).', v_count;
  END IF;

  -- Views / matviews dependentes
  SELECT c.relname INTO v_dep
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class c ON c.oid = r.ev_class
  WHERE d.refobjid = 'public.interactions'::regclass
    AND c.relkind IN ('v','m')
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Abortado: dependência inesperada (view/matview) sobre public.interactions.';
  END IF;

  -- Chaves estrangeiras de outras tabelas apontando para interactions
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE confrelid = 'public.interactions'::regclass
  ) THEN
    RAISE EXCEPTION 'Abortado: existem chaves estrangeiras referenciando public.interactions.';
  END IF;

  -- Triggers não pertencentes à própria tabela legada
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.interactions'::regclass
      AND NOT tgisinternal
      AND tgname NOT IN ('trg_inter_updated','trg_log_interaction')
  ) THEN
    RAISE EXCEPTION 'Abortado: trigger inesperado em public.interactions.';
  END IF;

  DROP TABLE public.interactions;
END
$$;

DO $$
BEGIN
  IF to_regproc('public.log_interaction') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgfoid = 'public.log_interaction'::regproc
  ) THEN
    RAISE EXCEPTION 'Abortado: public.log_interaction ainda é usada por trigger(s).';
  END IF;

  DROP FUNCTION public.log_interaction();
END
$$;