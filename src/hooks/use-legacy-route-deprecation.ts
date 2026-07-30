import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  LEGACY_REDIRECT_FLAG,
  isForcedClientRedirect,
  isLegacyRoute,
  legacyDestination,
  type LegacyAudience,
  type LegacyParams,
  type LegacyRoute,
  type LegacyTelemetryAction,
} from "@/lib/legacy-routes";


/**
 * Fase 7 / C2 — telemetria + redirect controlado por feature flag para as
 * rotas legadas (/solicitacoes e /validades).
 *
 * Telemetria grava apenas: usuário, papel, rota, empresa (quando aplicável),
 * ação e data. Nunca título, conteúdo, nome de arquivo ou storage_path.
 *
 * C2: o hook passa a atender também o perfil cliente em `/solicitacoes`,
 * cujo destino é o Portal (`/meus-documentos`) e nunca `/documentos`.
 */
export function useLegacyRouteDeprecation(
  route: LegacyRoute,
  params?: LegacyParams,
  options?: { enabled?: boolean; audience?: LegacyAudience },
) {
  const audience: LegacyAudience = options?.audience ?? "staff";
  const navigate = useNavigate();
  const { enabled: redirectEnabled, isLoading: flagLoading } = useFeatureFlag(LEGACY_REDIRECT_FLAG);
  const loggedView = useRef(false);
  const redirected = useRef(false);

  const destination = useMemo(
    () => legacyDestination(route, audience, params),
    // params é um objeto literal recriado a cada render; dependemos dos campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, audience, params?.client, params?.comp, params?.item, params?.q],
  );

  // Sem destino válido para o perfil (ex.: cliente em /validades) → camada inerte.
  const active = (options?.enabled ?? true) && !!destination;

  const log = useCallback(
    (action: LegacyTelemetryAction, clientId?: string | null) => {
      // Best-effort: telemetria nunca pode quebrar a rota legada.
      void supabase
        .rpc("log_legacy_route_access", {
          _route: route,
          _action: action,
          _client_id: clientId && clientId !== "all" ? clientId : undefined,
        })
        .then(({ error }) => {
          if (error) console.warn("[legacy-telemetry]", action, error.message);
        });
    },
    [route],
  );

  // Registra a visita uma única vez por montagem (todos os perfis atendidos).
  useEffect(() => {
    if (!active || loggedView.current || flagLoading) return;
    loggedView.current = true;
    log(redirectEnabled ? "redirect" : "view", params?.client ?? null);
  }, [active, log, flagLoading, redirectEnabled, params?.client]);

  // Redirect somente quando a flag estiver ativa. Com a flag falsa,
  // a rota antiga permanece integralmente acessível.
  useEffect(() => {
    if (!active || flagLoading || !redirectEnabled || redirected.current || !destination) return;
    // Proteção extra contra loop: o destino nunca pode ser uma rota legada.
    if (isLegacyRoute(destination.to)) return;
    redirected.current = true;
    navigate({
      to: destination.to,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (() => destination.search) as any,
      replace: true,
    });
  }, [active, flagLoading, redirectEnabled, navigate, destination]);

  const openCentral = useCallback(() => {
    if (!destination) return;
    log("open_central", params?.client ?? null);
    navigate({
      to: destination.to,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (() => destination.search) as any,
    });
  }, [log, navigate, destination, params?.client]);

  return {
    redirectEnabled: active && redirectEnabled,
    flagLoading,
    log,
    openCentral,
    audience,
    destination,
    /** Compat com a Fase 7: search do destino (vazio quando não há destino). */
    target: destination?.search ?? {},
  };
}
