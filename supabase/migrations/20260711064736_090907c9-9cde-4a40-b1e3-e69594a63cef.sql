-- Root cause: notify_user() inserted notifications with is_demo=false regardless of recipient.
-- When triggers (open_company_process, checklist, tax guide, etc.) fired for demo personas during seeding,
-- the resulting real notification hit enforce_notification_demo_consistency and aborted the seed.
-- Fix: notify_user derives is_demo/demo_batch_id from the recipient's profile — real users still get
-- real notifications (unchanged behavior), demo users get demo notifications automatically.

CREATE OR REPLACE FUNCTION public.notify_user(_user_id uuid, _tipo text, _titulo text, _mensagem text, _link text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_demo boolean;
  v_batch uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  SELECT coalesce(is_demo, false), demo_batch_id
    INTO v_is_demo, v_batch
    FROM public.profiles
   WHERE id = _user_id;
  INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, link, lida, is_demo, demo_batch_id)
  VALUES (_user_id, _tipo, _titulo, _mensagem, _link, false, coalesce(v_is_demo, false), v_batch);
END;
$function$;