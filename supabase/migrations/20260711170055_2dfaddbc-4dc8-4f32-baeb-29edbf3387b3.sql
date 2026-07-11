
-- 1) Fix existing demo collaborators (only rows explicitly flagged as demo).
UPDATE public.collaborators
   SET status = 'active'
 WHERE is_demo = true AND status = 'ativo';

-- 2) Patch admin_demo_seed_batch: collaborators.status must be 'active' (English).
DO $mig$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'admin_demo_seed_batch';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'admin_demo_seed_batch not found';
  END IF;

  v_src := replace(
    v_src,
    $old$'Contador Sênior', 'contabil', 'ativo', true, v_batch)$old$,
    $new$'Contador Sênior', 'contabil', 'active', true, v_batch)$new$
  );
  v_src := replace(
    v_src,
    $old$'Analista Fiscal', 'fiscal', 'ativo', true, v_batch)$old$,
    $new$'Analista Fiscal', 'fiscal', 'active', true, v_batch)$new$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.admin_demo_seed_batch(_label text, _personas jsonb)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
     AS %L',
    v_src
  );
END
$mig$;
