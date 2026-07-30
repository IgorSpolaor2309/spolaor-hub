DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.client_month_status') IS NULL THEN
    RAISE NOTICE 'client_month_status já removida';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.client_month_status' INTO v_rows;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'client_month_status possui % registros — remoção abortada', v_rows;
  END IF;

  EXECUTE 'DROP TABLE public.client_month_status';
END $$;