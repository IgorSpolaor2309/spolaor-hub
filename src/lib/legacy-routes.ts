/**
 * Fase 7 / C2 — Transição e depreciação controlada da Central de Documentos.
 *
 * Este módulo concentra:
 *  - a identificação das rotas legadas;
 *  - a chave da feature flag de redirect;
 *  - o mapeamento de destino legado → rota oficial, **por perfil**.
 *
 * Nenhum dado sensível (conteúdo, nome de arquivo, storage_path) trafega
 * por aqui: apenas metadados de navegação.
 */

export const LEGACY_ROUTES = ["/solicitacoes", "/validades"] as const;
export type LegacyRoute = (typeof LEGACY_ROUTES)[number];

export const LEGACY_REDIRECT_FLAG = "legacy_document_routes_redirect_enabled";

/** Rotas oficiais. `/documentos` é staff; `/meus-documentos` é cliente. */
export const OFFICIAL_ROUTES = ["/documentos", "/meus-documentos"] as const;
export type OfficialRoute = (typeof OFFICIAL_ROUTES)[number];

export type LegacyAudience = "staff" | "client";

export type LegacyTelemetryAction =
  | "view"
  | "open_central"
  | "redirect"
  | "filter"
  | "create"
  | "update";

export type WorkspaceSearch = Record<string, string | number | undefined>;

export type LegacyDestination = { to: OfficialRoute; search: WorkspaceSearch };

/** Parâmetros de navegação que podem ser preservados no redirect. */
export type LegacyParams = {
  client?: string;
  comp?: string;
  /** Identificador de item suportado por ambos os workspaces (`item`). */
  item?: string;
  /** Busca textual suportada por ambos os workspaces (`q`). */
  q?: string;
};

/** Remove chaves vazias para manter a URL da rota oficial limpa e estável. */
function clean(search: WorkspaceSearch): WorkspaceSearch {
  const out: WorkspaceSearch = {};
  for (const [k, v] of Object.entries(search)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all") out[k] = v;
  }
  return out;
}

export function isLegacyRoute(route: string): route is LegacyRoute {
  return (LEGACY_ROUTES as readonly string[]).includes(route);
}

/**
 * Destino oficial de uma rota legada, resolvido por perfil.
 *
 * staff:
 *   `/solicitacoes` → `/documentos?tab=aguardando_cliente`
 *   `/validades`    → `/documentos?tab=vencendo`
 * cliente:
 *   `/solicitacoes` → `/meus-documentos?section=precisa_enviar`
 *   `/validades`    → sem destino (rota staff-only; nunca enviar cliente a `/documentos`)
 */
export function legacyDestination(
  route: LegacyRoute,
  audience: LegacyAudience,
  params?: LegacyParams,
): LegacyDestination | null {
  const carry = {
    client: params?.client,
    comp: params?.comp,
    item: params?.item,
    q: params?.q,
  };

  if (audience === "client") {
    if (route === "/validades") {
      return {
        to: "/meus-documentos",
        search: clean({ section: "historico", ...carry }),
      };
    }
    return {
      to: "/meus-documentos",
      search: clean({ section: "precisa_enviar", ...carry }),
    };
  }


  return {
    to: "/documentos",
    search: clean({
      tab: route === "/solicitacoes" ? "aguardando_cliente" : "vencendo",
      ...carry,
    }),
  };
}

/**
 * Compat: mantém a assinatura usada pela Fase 7 (somente staff).
 * Sempre resolve para os filtros de `/documentos`.
 */
export function legacyRedirectSearch(
  route: LegacyRoute,
  params?: LegacyParams,
): WorkspaceSearch {
  return legacyDestination(route, "staff", params)!.search;
}

export const LEGACY_NOTICE_COPY: Record<LegacyRoute, { title: string; description: string }> = {
  "/solicitacoes": {
    title: "Esta tela foi consolidada na Central de Documentos",
    description:
      "Solicitações e documentos agora vivem em um único lugar, com abas, filtros e ações rápidas. Esta versão antiga continua disponível temporariamente e será desativada.",
  },
  "/validades": {
    title: "Esta tela foi consolidada na Central de Documentos",
    description:
      "O controle de validades agora faz parte da Central de Documentos, nas abas Vencendo e Vencidos. Esta versão antiga continua disponível temporariamente e será desativada.",
  },
};

/** Copy do aviso para o perfil cliente (destino é o Portal, não a Central). */
export const LEGACY_NOTICE_COPY_CLIENT: Record<LegacyRoute, { title: string; description: string }> = {
  "/solicitacoes": {
    title: "Esta tela agora fica em Meus documentos",
    description:
      "O que a contabilidade precisa que você envie, os reenvios e o histórico ficam em “Meus documentos”. Esta versão antiga continua disponível temporariamente.",
  },
  "/validades": LEGACY_NOTICE_COPY["/validades"],
};

export function legacyNoticeCopy(route: LegacyRoute, audience: LegacyAudience) {
  return audience === "client" ? LEGACY_NOTICE_COPY_CLIENT[route] : LEGACY_NOTICE_COPY[route];
}

/** Rótulo do botão do aviso, coerente com o destino do perfil. */
export function legacyNoticeCta(audience: LegacyAudience) {
  return audience === "client" ? "Abrir Meus documentos" : "Abrir Central de Documentos";
}
