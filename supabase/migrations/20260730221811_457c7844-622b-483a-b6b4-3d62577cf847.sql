DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.interactions;
  IF n > 0 THEN
    RAISE EXCEPTION 'Abortado: public.interactions possui % registro(s). Nenhuma alteracao aplicada.', n;
  END IF;
END $$;

-- Remove todas as policies atuais (leitura ampla incluindo Cliente, insert, delete)
DROP POLICY IF EXISTS "Inter: access read" ON public.interactions;
DROP POLICY IF EXISTS "Inter: admin delete" ON public.interactions;
DROP POLICY IF EXISTS "Inter: admin/collab insert" ON public.interactions;

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

-- Somente leitura, apenas staff legitimamente vinculado a empresa
CREATE POLICY "interactions_select_staff_only"
ON public.interactions
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'collaborator'::public.app_role))
  AND public.user_has_client_access(auth.uid(), client_id)
);

-- Sem escrita pelo aplicativo
REVOKE INSERT, UPDATE, DELETE ON public.interactions FROM authenticated;
REVOKE ALL ON public.interactions FROM anon;
GRANT SELECT ON public.interactions TO authenticated;
GRANT ALL ON public.interactions TO service_role;