-- =====================================================================
-- FASE 7 — Transição e depreciação controlada da Central de Documentos
-- =====================================================================

-- 1) Feature flags -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_feature_flags (
  key         text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_feature_flags TO authenticated;
GRANT ALL    ON public.app_feature_flags TO service_role;

ALTER TABLE public.app_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY aff_select_authenticated ON public.app_feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_app_feature_flags_updated_at
  BEFORE UPDATE ON public.app_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_feature_flags (key, enabled, description)
VALUES (
  'legacy_document_routes_redirect_enabled',
  false,
  'Quando ativo, /solicitacoes e /validades redirecionam para /documentos com filtros equivalentes. Fase 7 — inicia desligado.'
)
ON CONFLICT (key) DO NOTHING;

-- 2) Telemetria de acesso às rotas legadas -----------------------------
CREATE TABLE IF NOT EXISTS public.legacy_route_access_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role  text NOT NULL,
  route      text NOT NULL,
  action     text NOT NULL DEFAULT 'view',
  client_id  uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lral_route_allowed CHECK (route IN ('/solicitacoes', '/validades')),
  CONSTRAINT lral_action_len CHECK (char_length(action) BETWEEN 1 AND 64),
  CONSTRAINT lral_role_len CHECK (char_length(user_role) BETWEEN 1 AND 32)
);

CREATE INDEX IF NOT EXISTS idx_lral_route_created ON public.legacy_route_access_log (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lral_user_created  ON public.legacy_route_access_log (user_id, created_at DESC);

GRANT SELECT ON public.legacy_route_access_log TO authenticated;
GRANT ALL    ON public.legacy_route_access_log TO service_role;

ALTER TABLE public.legacy_route_access_log ENABLE ROW LEVEL SECURITY;

-- Leitura: dono do registro ou admin. Sem policies de INSERT/UPDATE/DELETE:
-- a escrita acontece exclusivamente pela função SECURITY DEFINER abaixo.
CREATE POLICY lral_select_own_or_admin ON public.legacy_route_access_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Helpers -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_feature_flag(_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT enabled FROM public.app_feature_flags WHERE key = _key), false);
$$;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag(_key text, _enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.app_feature_flags SET enabled = _enabled WHERE key = _key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown feature flag';
  END IF;
  RETURN _enabled;
END;
$$;

-- Registra acesso a rota legada. Grava somente metadados de navegação:
-- nunca título, conteúdo, nome de arquivo ou storage_path.
CREATE OR REPLACE FUNCTION public.log_legacy_route_access(
  _route text,
  _action text DEFAULT 'view',
  _client_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _route NOT IN ('/solicitacoes', '/validades') THEN
    RAISE EXCEPTION 'unsupported legacy route';
  END IF;

  SELECT CASE
           WHEN public.has_role(v_uid, 'admin'::app_role) THEN 'admin'
           WHEN public.has_role(v_uid, 'collaborator'::app_role) THEN 'collaborator'
           WHEN public.has_role(v_uid, 'client'::app_role) THEN 'client'
           ELSE 'unknown'
         END INTO v_role;

  INSERT INTO public.legacy_route_access_log (user_id, user_role, route, action, client_id)
  VALUES (v_uid, v_role, _route, LEFT(COALESCE(NULLIF(TRIM(_action), ''), 'view'), 64), _client_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_feature_flag(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_feature_flag(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_legacy_route_access(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feature_flag(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag(text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_legacy_route_access(text, text, uuid) TO authenticated, service_role;

-- 4) Remover document_storage_path do retorno da Central ---------------
CREATE OR REPLACE FUNCTION public.list_document_workspace_paginated(_tab text DEFAULT 'todos'::text, _page integer DEFAULT 1, _page_size integer DEFAULT 30, _search text DEFAULT NULL::text, _client_id uuid DEFAULT NULL::uuid, _competencia text DEFAULT NULL::text, _categoria text DEFAULT NULL::text, _tipo text DEFAULT NULL::text, _departamento text DEFAULT NULL::text, _status text DEFAULT NULL::text, _action_owner text DEFAULT NULL::text, _responsavel_id uuid DEFAULT NULL::uuid, _origem text DEFAULT NULL::text, _prazo_from date DEFAULT NULL::date, _prazo_to date DEFAULT NULL::date, _validade_from date DEFAULT NULL::date, _validade_to date DEFAULT NULL::date, _tem_documento boolean DEFAULT NULL::boolean, _tem_vinculo boolean DEFAULT NULL::boolean, _somente_meus boolean DEFAULT false, _include_demo boolean DEFAULT true, _demo_batch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid    := auth.uid();
  v_page  integer := GREATEST(COALESCE(_page, 1), 1);
  v_size  integer := LEAST(GREATEST(COALESCE(_page_size, 30), 1), 100);
  v_off   integer := (v_page - 1) * v_size;
  v_rows  jsonb;
  v_counts jsonb;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'collaborator'::app_role)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  WITH
  req AS (
    SELECT
      dr.id                          AS item_id,
      'document_request'::text       AS item_kind,
      dr.client_id,
      c.razao_social                 AS empresa_nome,
      COALESCE(c.cnpj, c.documento)  AS empresa_documento,
      dr.titulo,
      dr.descricao                   AS descricao_resumida,
      dr.categoria,
      dr.tipo_solicitacao            AS tipo,
      dr.departamento,
      dr.competencia,
      dr.status,
      public._doc_workspace_status_label_staff('document_request', dr.status, d.data_validade) AS status_label,
      CASE
        WHEN dr.status IN ('concluido','cancelado') THEN 'none'
        WHEN dr.status = 'recebido' THEN 'staff'
        WHEN dr.status = 'reenviar' THEN 'client'
        WHEN dr.status = 'aguardando' THEN
          CASE
            WHEN dr.criado_por_role = 'staff'  THEN 'client'
            WHEN dr.criado_por_role = 'client' THEN 'staff'
            WHEN dr.criado_por IS NOT NULL
             AND public.has_role(dr.criado_por, 'client'::app_role) THEN 'staff'
            ELSE 'client'
          END
        ELSE 'client'
      END                            AS action_owner,
      dr.prazo,
      d.data_validade,
      dr.urgencia                    AS urgency,
      dr.responsavel_profile_id      AS responsavel_id,
      pr.full_name                   AS responsavel_nome,
      dr.document_id,
      d.nome                         AS document_name,
      d.storage_path                 AS document_storage_path,
      (dr.document_id IS NOT NULL)   AS has_document,
      (dr.company_process_id IS NOT NULL
        OR dr.company_process_step_id IS NOT NULL
        OR dr.company_process_step_requirement_id IS NOT NULL) AS has_process_link,
      1                              AS links_count,
      dr.company_process_id,
      dr.company_process_step_id,
      dr.company_process_step_requirement_id,
      pt.nome                        AS process_type_name,
      cps.nome                       AS process_step_name,
      (d.data_validade IS NOT NULL
        AND d.data_validade >= CURRENT_DATE
        AND d.data_validade <= (CURRENT_DATE + 30))  AS is_expiring,
      (d.data_validade IS NOT NULL AND d.data_validade < CURRENT_DATE) AS is_expired,
      dr.is_demo,
      dr.demo_batch_id,
      dr.criado_por_role,
      dr.criado_por,
      dr.created_at,
      dr.updated_at
    FROM public.document_requests dr
    JOIN public.clients c ON c.id = dr.client_id
    LEFT JOIN public.documents d ON d.id = dr.document_id AND d.deleted_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = dr.responsavel_profile_id
    LEFT JOIN public.company_processes cp ON cp.id = dr.company_process_id
    LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
    LEFT JOIN public.company_process_steps cps ON cps.id = dr.company_process_step_id
    WHERE dr.deleted_at IS NULL
  ),
  doc_links AS (
    SELECT d.id AS document_id,
           (array_agg(cpd.company_process_id      ORDER BY cpd.created_at DESC NULLS LAST))[1] AS main_process_id,
           (array_agg(cpd.company_process_step_id ORDER BY cpd.created_at DESC NULLS LAST))[1] AS main_step_id,
           COUNT(*)::int                          AS links_count
      FROM public.documents d
      JOIN public.company_process_documents cpd ON cpd.document_id = d.id
     WHERE d.deleted_at IS NULL
     GROUP BY d.id
  ),
  doc AS (
    SELECT
      d.id                          AS item_id,
      'document'::text              AS item_kind,
      d.client_id,
      c.razao_social                AS empresa_nome,
      COALESCE(c.cnpj, c.documento) AS empresa_documento,
      d.nome                        AS titulo,
      NULL::text                    AS descricao_resumida,
      d.categoria_validade          AS categoria,
      d.tipo                        AS tipo,
      NULL::text                    AS departamento,
      d.competencia,
      NULL::text                    AS status,
      public._doc_workspace_status_label_staff('document', NULL, d.data_validade) AS status_label,
      'none'::text                  AS action_owner,
      NULL::date                    AS prazo,
      d.data_validade,
      NULL::text                    AS urgency,
      NULL::uuid                    AS responsavel_id,
      NULL::text                    AS responsavel_nome,
      d.id                          AS document_id,
      d.nome                        AS document_name,
      d.storage_path                AS document_storage_path,
      true                          AS has_document,
      (dl.document_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.company_process_step_requirements r
         WHERE r.document_id = d.id
      ))                            AS has_process_link,
      COALESCE(dl.links_count, 0)   AS links_count,
      dl.main_process_id            AS company_process_id,
      dl.main_step_id               AS company_process_step_id,
      NULL::uuid                    AS company_process_step_requirement_id,
      pt.nome                       AS process_type_name,
      cps.nome                      AS process_step_name,
      (d.data_validade IS NOT NULL
        AND d.data_validade >= CURRENT_DATE
        AND d.data_validade <= (CURRENT_DATE + 30))  AS is_expiring,
      (d.data_validade IS NOT NULL AND d.data_validade < CURRENT_DATE) AS is_expired,
      d.is_demo,
      d.demo_batch_id,
      NULL::text                    AS criado_por_role,
      d.uploaded_by                 AS criado_por,
      d.created_at,
      d.updated_at
    FROM public.documents d
    JOIN public.clients c ON c.id = d.client_id
    LEFT JOIN doc_links dl ON dl.document_id = d.id
    LEFT JOIN public.company_processes cp ON cp.id = dl.main_process_id
    LEFT JOIN public.process_types pt ON pt.id = cp.process_type_id
    LEFT JOIN public.company_process_steps cps ON cps.id = dl.main_step_id
    WHERE d.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.document_requests dr2
         WHERE dr2.document_id = d.id AND dr2.deleted_at IS NULL
      )
  ),
  base AS (
    SELECT * FROM req
    UNION ALL
    SELECT * FROM doc
  ),
  filtered AS (
    SELECT b.* FROM base b
    WHERE
      (_client_id     IS NULL OR b.client_id = _client_id)
      AND (_competencia   IS NULL OR b.competencia = _competencia)
      AND (_categoria     IS NULL OR b.categoria = _categoria)
      AND (_tipo          IS NULL OR b.tipo = _tipo)
      AND (_departamento  IS NULL OR b.departamento = _departamento)
      AND (_status        IS NULL OR b.status = _status)
      AND (_action_owner  IS NULL OR b.action_owner = _action_owner)
      AND (_responsavel_id IS NULL OR b.responsavel_id = _responsavel_id)
      AND (
        _origem IS NULL
        OR (_origem = 'document_avulso' AND b.item_kind = 'document')
        OR (_origem = 'staff'  AND b.item_kind = 'document_request' AND b.criado_por_role = 'staff')
        OR (_origem = 'client' AND b.item_kind = 'document_request' AND b.criado_por_role = 'client')
      )
      AND (_prazo_from    IS NULL OR b.prazo >= _prazo_from)
      AND (_prazo_to      IS NULL OR b.prazo <= _prazo_to)
      AND (_validade_from IS NULL OR b.data_validade >= _validade_from)
      AND (_validade_to   IS NULL OR b.data_validade <= _validade_to)
      AND (_tem_documento IS NULL OR (b.document_id IS NOT NULL) = _tem_documento)
      AND (_tem_vinculo   IS NULL OR b.has_process_link = _tem_vinculo)
      AND (NOT _somente_meus OR b.responsavel_id = v_uid OR b.criado_por = v_uid)
      AND (_include_demo OR NOT b.is_demo)
      AND (_demo_batch_id IS NULL OR b.demo_batch_id = _demo_batch_id)
      AND (
        _search IS NULL OR _search = '' OR
        b.empresa_nome ILIKE '%' || _search || '%' OR
        b.empresa_documento ILIKE '%' || _search || '%' OR
        b.titulo ILIKE '%' || _search || '%' OR
        COALESCE(b.tipo,'') ILIKE '%' || _search || '%' OR
        COALESCE(b.document_name,'') ILIKE '%' || _search || '%' OR
        COALESCE(b.competencia,'') ILIKE '%' || _search || '%' OR
        COALESCE(b.process_type_name,'') ILIKE '%' || _search || '%'
      )
  ),
  tabbed AS (
    SELECT f.* FROM filtered f
    WHERE
      CASE _tab
        WHEN 'todos' THEN true
        WHEN 'aguardando_cliente' THEN f.item_kind = 'document_request' AND f.status = 'aguardando' AND f.action_owner = 'client'
        WHEN 'recebidos' THEN f.item_kind = 'document_request' AND f.status = 'recebido'
        WHEN 'reenviar'  THEN f.item_kind = 'document_request' AND f.status = 'reenviar'
        WHEN 'concluidos' THEN f.item_kind = 'document_request' AND f.status = 'concluido'
        WHEN 'vinculados' THEN f.has_process_link = true
        WHEN 'vencendo' THEN f.is_expiring AND NOT f.is_expired
        WHEN 'vencidos' THEN f.is_expired
        ELSE true
      END
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(sub) - 'criado_por' - 'criado_por_role' - 'document_storage_path'
             ORDER BY sub.ord_key ASC, sub.updated_at DESC, sub.item_id ASC), '[]'::jsonb),
    (SELECT COUNT(*)::int FROM tabbed),
    (SELECT jsonb_build_object(
       'aguardando_cliente', COUNT(*) FILTER (WHERE item_kind='document_request' AND status='aguardando' AND action_owner='client'),
       'aguardando_equipe',  COUNT(*) FILTER (WHERE item_kind='document_request' AND status='aguardando' AND action_owner='staff'),
       'recebidos',          COUNT(*) FILTER (WHERE item_kind='document_request' AND status='recebido'),
       'reenviar',           COUNT(*) FILTER (WHERE item_kind='document_request' AND status='reenviar'),
       'concluidos',         COUNT(*) FILTER (WHERE item_kind='document_request' AND status='concluido'),
       'vencendo',           COUNT(*) FILTER (WHERE is_expiring AND NOT is_expired),
       'vencidos',           COUNT(*) FILTER (WHERE is_expired),
       'vinculados',         COUNT(*) FILTER (WHERE has_process_link),
       'sem_vinculo',        COUNT(*) FILTER (WHERE NOT has_process_link),
       'todos',              COUNT(*)
     ) FROM filtered)
  INTO v_rows, v_total, v_counts
  FROM (
    SELECT t.*,
           COALESCE(t.prazo, t.data_validade, t.updated_at::date, CURRENT_DATE) AS ord_key
      FROM tabbed t
     ORDER BY COALESCE(t.prazo, t.data_validade, t.updated_at::date, CURRENT_DATE) ASC,
              t.updated_at DESC, t.item_id ASC
     OFFSET v_off LIMIT v_size
  ) sub;

  RETURN jsonb_build_object(
    'rows',   COALESCE(v_rows, '[]'::jsonb),
    'counts', COALESCE(v_counts, '{}'::jsonb),
    'page',   v_page,
    'page_size', v_size,
    'total',  COALESCE(v_total, 0)
  );
END;
$function$;