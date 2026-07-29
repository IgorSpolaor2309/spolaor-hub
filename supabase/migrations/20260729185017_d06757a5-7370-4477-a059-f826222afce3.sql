DROP INDEX IF EXISTS public.document_request_files_one_active;

CREATE OR REPLACE FUNCTION public.drf_check_single_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.document_request_files
   WHERE document_request_id = COALESCE(NEW.document_request_id, OLD.document_request_id)
     AND active;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'Solicitação % ficaria com % versões ativas.',
      COALESCE(NEW.document_request_id, OLD.document_request_id), v_count;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.drf_check_single_active() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_drf_single_active ON public.document_request_files;
CREATE CONSTRAINT TRIGGER trg_drf_single_active
AFTER INSERT OR UPDATE ON public.document_request_files
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.drf_check_single_active();

CREATE INDEX IF NOT EXISTS document_request_files_active_idx
  ON public.document_request_files (document_request_id) WHERE active;
