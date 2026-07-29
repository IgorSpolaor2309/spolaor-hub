import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import {
  LEGACY_REDIRECT_FLAG,
  legacyRedirectSearch,
  type LegacyRoute,
  type LegacyTelemetryAction,
} from "@/lib/legacy-routes";

/**
 * Fase 7 — telemetria + redirect controlado por feature flag para as rotas
 * legadas (/solicitacoes e /validades).
 *
 * Telemetria grava apenas: usuário, papel, rota, empresa (quando aplicável),
 * ação e data. Nunca título, conteúdo, nome de arquivo ou storage_path.
 */
export function useLegacyRouteDeprecation(
  route: LegacyRoute,
  params?: { client?: string; comp?: string },
) {
  const navigate = useNavigate();
  const { enabled: redirectEnabled, isLoading: flagLoading } = useFeatureFlag(LEGACY_REDIRECT_FLAG);
  const loggedView = useRef(false);
  const redirected = useRef(false);

  const log = useCallback(
    (action: LegacyTelemetryAction, clientId?: string | null) => {
      // Best-effort: telemetria nunca pode quebrar a rota legada.
      void supabase
        .rpc("log_legacy_route_access", {
          _route: route,
          _action: action,
          _client_id: clientId && clientId !== "all" ? clientId : null,
        })
        .then(({ error }) => {
          if (error) console.warn("[legacy-telemetry]", action, error.message);
        });
    },
    [route],
  );

  const target = legacyRedirectSearch(route, params);

  // Registra a visita uma única vez por montagem.
  useEffect(() => {
    if (loggedView.current || flagLoading) return;
    loggedView.current = true;
    log(redirectEnabled ? "redirect" : "view", params?.client ?? null);
  }, [log, flagLoading, redirectEnabled, params?.client]);

  // Redirect somente quando a flag estiver ativa. Com a flag falsa,
  // a rota antiga permanece integralmente acessível.
  useEffect(() => {
    if (flagLoading || !redirectEnabled || redirected.current) return;
    redirected.current = true;
    navigate({
      to: "/documentos",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (() => target) as any,
      replace: true,
    });
  }, [flagLoading, redirectEnabled, navigate, target]);

  const openCentral = useCallback(() => {
    log("open_central", params?.client ?? null);
    navigate({
      to: "/documentos",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (() => target) as any,
    });
  }, [log, navigate, target, params?.client]);

  return { redirectEnabled, flagLoading, log, openCentral, target };
}
