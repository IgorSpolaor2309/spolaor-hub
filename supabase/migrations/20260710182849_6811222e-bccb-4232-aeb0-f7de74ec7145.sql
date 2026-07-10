CREATE OR REPLACE FUNCTION public.checklist_sync_request_on_conclude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'concluido'
     AND OLD.status IS DISTINCT FROM 'concluido'
     AND NEW.document_request_id IS NOT NULL THEN
    UPDATE public.document_requests
       SET status = 'recebido'
     WHERE id = NEW.document_request_id
       AND status NOT IN ('recebido','concluido');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ccl_sync_request ON public.client_checklist_items;
CREATE TRIGGER trg_ccl_sync_request
AFTER UPDATE OF status ON public.client_checklist_items
FOR EACH ROW
EXECUTE FUNCTION public.checklist_sync_request_on_conclude();