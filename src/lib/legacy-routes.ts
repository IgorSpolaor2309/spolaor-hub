/**
 * Fase 7 — Transição e depreciação controlada da Central de Documentos.
 *
 * Este módulo concentra:
 *  - a identificação das rotas legadas;
 *  - a chave da feature flag de redirect;
 *  - o mapeamento de filtros legado → Central de Documentos.
 *
 * Nenhum dado sensível (conteúdo, nome de arquivo, storage_path) trafega
 * por aqui: apenas metadados de navegação.
 */

export const LEGACY_ROUTES = ["/solicitacoes", "/validades"] as const;
export type LegacyRoute = (typeof LEGACY_ROUTES)[number];

export const LEGACY_REDIRECT_FLAG = "legacy_document_routes_redirect_enabled";

export type LegacyTelemetryAction =
  | "view"
  | "open_central"
  | "redirect"
  | "filter"
  | "create"
  | "update";

export type WorkspaceSearch = Record<string, string | number | undefined>;

/** Remove chaves vazias para manter a URL da Central limpa e estável. */
function clean(search: WorkspaceSearch): WorkspaceSearch {
  const out: WorkspaceSearch = {};
  for (const [k, v] of Object.entries(search)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

/**
 * Equivalência de filtros entre a rota legada e /documentos.
 * `/solicitacoes` → aba de solicitações aguardando o cliente, preservando
 * empresa e competência quando presentes na URL antiga.
 * `/validades`    → aba de validade (vencendo), que é o recorte equivalente.
 */
export function legacyRedirectSearch(
  route: LegacyRoute,
  params?: { client?: string; comp?: string },
): WorkspaceSearch {
  if (route === "/solicitacoes") {
    return clean({
      tab: "aguardando_cliente",
      client: params?.client,
      comp: params?.comp,
    });
  }
  return clean({
    tab: "vencendo",
    client: params?.client,
    comp: params?.comp,
  });
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
