
-- Recreate admin_demo_seed_batch fixing ambiguous v_persona in notifications SELECT.
-- Only the notifications block is affected; behavior otherwise identical.

DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='admin_demo_seed_batch';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'admin_demo_seed_batch not found';
  END IF;
  v_src := replace(
    v_src,
    $old$SELECT (v_persona->>'user_id')::uuid, 'sistema',$old$,
    $new$SELECT (p->>'user_id')::uuid, 'sistema',$new$
  );
  v_src := replace(
    v_src,
    $old$FROM jsonb_array_elements(_personas) v_persona;$old$,
    $new$FROM jsonb_array_elements(_personas) AS p;$new$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.admin_demo_seed_batch(_label text, _personas jsonb)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path = public
     AS %L',
    v_src
  );
END
$mig$;
