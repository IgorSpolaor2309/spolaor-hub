CREATE OR REPLACE FUNCTION public.drf_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Histórico é imutável para qualquer ator do aplicativo (cliente, colaborador, admin).
  -- Somente rotinas internas de servidor com credencial de serviço (limpeza/testes)
  -- podem remover definitivamente os registros.
  IF COALESCE((current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role', false)
     OR current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Histórico de arquivos não pode ser excluído.' USING ERRCODE = '42501';
END;
$function$;