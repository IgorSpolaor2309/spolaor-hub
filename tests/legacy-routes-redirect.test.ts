import { describe, expect, it } from "vitest";
import {
  LEGACY_ROUTES,
  LEGACY_REDIRECT_FLAG,
  isForcedClientRedirect,
  isLegacyRoute,
  legacyDestination,
  legacyNoticeCta,
  legacyRedirectSearch,
} from "@/lib/legacy-routes";

/**
 * Fase C2 — contrato dos redirects legados.
 * Nenhum dado privado: só rotas e parâmetros de navegação.
 */
describe("legacy routes — destino por perfil", () => {
  it("staff em /solicitacoes vai para a Central na aba aguardando_cliente", () => {
    const d = legacyDestination("/solicitacoes", "staff");
    expect(d).toEqual({ to: "/documentos", search: { tab: "aguardando_cliente" } });
  });

  it("staff em /validades vai para a Central na aba vencendo", () => {
    const d = legacyDestination("/validades", "staff");
    expect(d).toEqual({ to: "/documentos", search: { tab: "vencendo" } });
  });

  it("cliente em /solicitacoes vai para o Portal em precisa_enviar", () => {
    const d = legacyDestination("/solicitacoes", "client");
    expect(d).toEqual({ to: "/meus-documentos", search: { section: "precisa_enviar" } });
  });

  it("cliente nunca é enviado para /documentos", () => {
    for (const r of LEGACY_ROUTES) {
      const d = legacyDestination(r, "client");
      expect(d?.to === "/documentos").toBe(false);
    }
  });

  it("cliente em /validades vai para o histórico do Portal", () => {
    expect(legacyDestination("/validades", "client")).toEqual({
      to: "/meus-documentos",
      search: { section: "historico" },
    });
  });

  it("cliente em /validades preserva parâmetros válidos e descarta 'all'/vazios", () => {
    const d = legacyDestination("/validades", "client", {
      client: "all",
      comp: "2026-07",
      item: "",
      q: "certidao",
    });
    expect(d!.search).toEqual({ section: "historico", comp: "2026-07", q: "certidao" });
  });

  it("cliente em /validades tem redirect obrigatório, independente da flag", () => {
    expect(isForcedClientRedirect("/validades", "client")).toBe(true);
    expect(isForcedClientRedirect("/solicitacoes", "client")).toBe(false);
    expect(isForcedClientRedirect("/validades", "staff")).toBe(false);
  });

  it("preserva client, comp, item e q para staff", () => {
    const d = legacyDestination("/solicitacoes", "staff", {
      client: "c1",
      comp: "2026-07",
      item: "i1",
      q: "balanco",
    });
    expect(d!.search).toEqual({
      tab: "aguardando_cliente",
      client: "c1",
      comp: "2026-07",
      item: "i1",
      q: "balanco",
    });
  });

  it("preserva client, comp e item para cliente", () => {
    const d = legacyDestination("/solicitacoes", "client", { client: "c1", comp: "2026-07", item: "i1" });
    expect(d!.search).toEqual({
      section: "precisa_enviar",
      client: "c1",
      comp: "2026-07",
      item: "i1",
    });
  });

  it("descarta parâmetros vazios e o sentinela 'all' (cliente com 1 empresa ou sem filtro)", () => {
    const d = legacyDestination("/solicitacoes", "client", { client: "all", comp: "", item: undefined });
    expect(d!.search).toEqual({ section: "precisa_enviar" });
  });

  it("notificação antiga sem query resolve a seção/aba default de cada perfil", () => {
    expect(legacyDestination("/solicitacoes", "staff")!.search.tab).toBe("aguardando_cliente");
    expect(legacyDestination("/solicitacoes", "client")!.search.section).toBe("precisa_enviar");
  });

  it("nenhum destino pertence à lista de rotas legadas (sem loop)", () => {
    for (const r of LEGACY_ROUTES) {
      for (const a of ["staff", "client"] as const) {
        const d = legacyDestination(r, a);
        if (d) expect(isLegacyRoute(d.to)).toBe(false);
      }
    }
  });

  it("compat da Fase 7 (legacyRedirectSearch) continua resolvendo staff", () => {
    expect(legacyRedirectSearch("/solicitacoes", { client: "c1" })).toEqual({
      tab: "aguardando_cliente",
      client: "c1",
    });
    expect(legacyRedirectSearch("/validades")).toEqual({ tab: "vencendo" });
  });

  it("CTA do aviso é coerente com o destino do perfil", () => {
    expect(legacyNoticeCta("staff")).toMatch(/Central de Documentos/);
    expect(legacyNoticeCta("client")).toMatch(/Meus documentos/);
  });

  it("a chave da feature flag não muda", () => {
    expect(LEGACY_REDIRECT_FLAG).toBe("legacy_document_routes_redirect_enabled");
  });
});
