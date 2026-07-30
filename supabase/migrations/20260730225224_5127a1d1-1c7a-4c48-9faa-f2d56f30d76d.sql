-- Fase D3.3: segredo interno dos crons, gerado dentro do banco.
-- O valor nunca aparece nesta migration, no comando do cron, no repositório ou em logs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_internal_secret') THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'cron_internal_secret',
      'Fase D3.3 - segredo interno de autenticacao dos jobs pg_cron (HTTP)'
    );
  END IF;
END
$$;

-- Verificação do segredo dentro do banco: o valor esperado nunca é retornado.
CREATE OR REPLACE FUNCTION public.cron_secret_matches(p_provided text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_expected text;
BEGIN
  IF p_provided IS NULL OR length(p_provided) = 0 THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret INTO v_expected
  FROM vault.decrypted_secrets
  WHERE name = 'cron_internal_secret'
  LIMIT 1;

  IF v_expected IS NULL OR length(v_expected) = 0 THEN
    RETURN false;
  END IF;

  RETURN v_expected = p_provided;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_secret_matches(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_secret_matches(text) FROM anon;
REVOKE ALL ON FUNCTION public.cron_secret_matches(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_secret_matches(text) TO service_role;