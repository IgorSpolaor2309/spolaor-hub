-- ============================================================
-- FASE A2 — Padronização de clients.status + congelamento de client_month_status
-- ============================================================

DO $$
DECLARE
  v_unknown text;
  v_ativo int;
  v_inativo int;
BEGIN
  -- 1) Abortar se existir valor desconhecido (fora de active/inactive/ativo/inativo)
  SELECT string_agg(DISTINCT status, ', ')
    INTO v_unknown
    FROM public.clients
   WHERE status IS NULL
      OR status NOT IN ('active', 'inactive', 'ativo', 'inativo');

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'A2: valores de clients.status desconhecidos encontrados: %', v_unknown;
  END IF;

  -- 2) Normalização idempotente (não toca deleted_at, is_demo, nem demais colunas)
  SELECT count(*) FILTER (WHERE status = 'ativo'),
         count(*) FILTER (WHERE status = 'inativo')
    INTO v_ativo, v_inativo
    FROM public.clients;

  IF v_ativo > 0 THEN
    UPDATE public.clients SET status = 'active' WHERE status = 'ativo';
  END IF;

  IF v_inativo > 0 THEN
    UPDATE public.clients SET status = 'inactive' WHERE status = 'inativo';
  END IF;

  RAISE NOTICE 'A2: normalizados ativo=% inativo=%', v_ativo, v_inativo;
END
$$;

-- 3) Default explícito
ALTER TABLE public.clients ALTER COLUMN status SET DEFAULT 'active';

-- 4) CHECK constraint única e nomeada (idempotente)
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check CHECK (status IN ('active', 'inactive'));

-- ============================================================
-- A2.2 — Congelar client_month_status (tabela vazia; sem backfill/arquivo)
-- ============================================================

-- Remove privilégios de escrita da role da aplicação
REVOKE INSERT, UPDATE, DELETE ON public.client_month_status FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.client_month_status FROM anon;

-- SELECT permanece temporariamente por compatibilidade
GRANT SELECT ON public.client_month_status TO authenticated;

-- Acesso administrativo interno preservado
GRANT ALL ON public.client_month_status TO service_role;

-- Remove as políticas de escrita (defesa em profundidade; SELECT preservado)
DROP POLICY IF EXISTS "Admin and assigned collab insert month status" ON public.client_month_status;
DROP POLICY IF EXISTS "Admin and assigned collab update month status" ON public.client_month_status;
DROP POLICY IF EXISTS "Admin can delete month status" ON public.client_month_status;

COMMENT ON TABLE public.client_month_status IS
  'DEPRECADA (Fase A2): substituída por public.client_competences como fonte oficial do status mensal. Somente leitura; escrita revogada. DROP planejado para fase posterior.';
