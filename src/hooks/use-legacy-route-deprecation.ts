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

  // Rotas internas que o cliente nunca pode renderizar: redirect obrigatório,
  // independentemente da feature flag.
  const forced = isForcedClientRedirect(route, audience);

  // Sem destino válido para o perfil → camada inerte.
  const active = (options?.enabled ?? true) && !!destination;

  // Redirect efetivo: forçado (cliente em rota interna) ou controlado pela flag.
  const willRedirect = active && (forced || (!flagLoading && redirectEnabled));

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
    if (!active || loggedView.current) return;
    if (!forced && flagLoading) return;
    loggedView.current = true;
    log(willRedirect ? "redirect" : "view", params?.client ?? null);
  }, [active, forced, log, flagLoading, willRedirect, params?.client]);

  // Redirect quando forçado (cliente) ou quando a flag estiver ativa.
  // Com a flag falsa, staff mantém a rota antiga integralmente acessível.
  useEffect(() => {
    if (!active || !willRedirect || redirected.current || !destination) return;
    // Proteção extra contra loop: o destino nunca pode ser uma rota legada.
    if (isLegacyRoute(destination.to)) return;
    redirected.current = true;
    navigate({
      to: destination.to,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (() => destination.search) as any,
      replace: true,
    });
  }, [active, willRedirect, navigate, destination]);


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
    redirectEnabled: willRedirect,
    /** Redirect obrigatório (cliente em rota interna), ignora a flag. */
    forcedRedirect: forced && active,
    flagLoading,
    log,
    openCentral,
    audience,
    destination,
    /** Compat com a Fase 7: search do destino (vazio quando não há destino). */
    target: destination?.search ?? {},
  };

}
