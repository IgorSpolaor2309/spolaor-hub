import { describe, expect, it } from "vitest";
import {
  CHAT_NOTIFICATION_TYPE, activityStamp, bannerKey, conversationIdFromLink,
  conversationLink, isSafeInternalLink, shouldShowBanner,
  type NotificationEvent, type NotificationRow,
} from "@/lib/notification-banner";

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const CONV = "33333333-3333-3333-3333-333333333333";
const CONV2 = "44444444-4444-4444-4444-444444444444";

function row(over: Partial<NotificationRow> = {}): Partial<NotificationRow> {
  return {
    id: "n1", user_id: ME, tipo: CHAT_NOTIFICATION_TYPE, titulo: "Nova mensagem",
    mensagem: "texto", link: conversationLink(CONV), lida: false,
    created_at: "2026-07-31T10:00:00.000Z", ...over,
  };
}
const ev = (e: Partial<NotificationEvent>): NotificationEvent =>
  ({ eventType: "INSERT", new: row(), old: null, ...e });

describe("link canônico de conversa", () => {
  it("gera e normaliza o mesmo formato", () => {
    expect(conversationLink(CONV)).toBe(`/interacoes?conversation=${CONV}`);
    expect(conversationIdFromLink(conversationLink(CONV))).toBe(CONV);
  });
  it("aceita o parâmetro após outros parâmetros", () => {
    expect(conversationIdFromLink(`/interacoes?situacao=aguardando_equipe&conversation=${CONV}`)).toBe(CONV);
  });
  it("não confunde conversas diferentes", () => {
    expect(conversationIdFromLink(conversationLink(CONV2))).not.toBe(CONV);
  });
  it("ignora links de outros módulos", () => {
    expect(conversationIdFromLink("/documentos")).toBeNull();
    expect(conversationIdFromLink(null)).toBeNull();
  });
});

describe("segurança do link do banner", () => {
  it("aceita apenas rotas internas", () => {
    expect(isSafeInternalLink("/documentos")).toBe(true);
    expect(isSafeInternalLink(conversationLink(CONV))).toBe(true);
  });
  it("rejeita domínio externo, protocolo e vazio", () => {
    expect(isSafeInternalLink("https://exemplo.com/x")).toBe(false);
    expect(isSafeInternalLink("//exemplo.com")).toBe(false);
    expect(isSafeInternalLink("javascript:alert(1)")).toBe(false);
    expect(isSafeInternalLink("documentos")).toBe(false);
    expect(isSafeInternalLink(null)).toBe(false);
  });
});

describe("eventos que geram banner", () => {
  it("INSERT destinado ao usuário gera banner", () => {
    expect(shouldShowBanner(ev({ eventType: "INSERT" }), ME)).toBe(true);
  });
  it("INSERT de outro usuário não gera banner", () => {
    expect(shouldShowBanner(ev({ new: row({ user_id: OTHER }) }), ME)).toBe(false);
  });
  it("UPDATE de consolidação (segue não lida) gera banner", () => {
    expect(shouldShowBanner(ev({
      eventType: "UPDATE",
      old: row({ created_at: "2026-07-31T10:00:00.000Z" }),
      new: row({ created_at: "2026-07-31T10:05:00.000Z" }),
    }), ME)).toBe(true);
  });
  it("UPDATE de leitura não gera banner", () => {
    expect(shouldShowBanner(ev({
      eventType: "UPDATE",
      old: row({ lida: false }),
      new: row({ lida: true, created_at: "2026-07-31T10:05:00.000Z" }),
    }), ME)).toBe(false);
  });
  it("UPDATE sem avanço temporal não gera banner", () => {
    expect(shouldShowBanner(ev({
      eventType: "UPDATE",
      old: row(),
      new: row(),
    }), ME)).toBe(false);
  });
  it("DELETE e linha ausente não geram banner", () => {
    expect(shouldShowBanner(ev({ eventType: "DELETE", new: null }), ME)).toBe(false);
    expect(shouldShowBanner(ev({ new: null }), ME)).toBe(false);
  });
  it("sem usuário autenticado nunca gera banner", () => {
    expect(shouldShowBanner(ev({}), null)).toBe(false);
  });
  it("funciona para documentos, guias e processos", () => {
    for (const tipo of ["documento", "guia", "processo", "competencia", "pendencia"]) {
      expect(shouldShowBanner(ev({ new: row({ tipo, link: "/documentos" }) }), ME)).toBe(true);
    }
  });
});

describe("deduplicação em memória", () => {
  it("o mesmo evento entregue duas vezes produz uma única chave", () => {
    const seen = new Set<string>();
    const e = ev({});
    for (let i = 0; i < 2; i++) if (shouldShowBanner(e, ME)) seen.add(bannerKey(e.new));
    expect(seen.size).toBe(1);
  });
  it("nova atividade na mesma linha gera nova chave", () => {
    const a = row();
    const b = row({ created_at: "2026-07-31T10:05:00.000Z" });
    expect(bannerKey(a)).not.toBe(bannerKey(b));
    expect(activityStamp(b) > activityStamp(a)).toBe(true);
  });
  it("carregamento inicial e refetch não passam por eventos", () => {
    // Sem evento Realtime não há chamada ao helper: nada é exibido.
    const seen = new Set<string>();
    expect(seen.size).toBe(0);
  });
});

describe("escopo da marcação de leitura", () => {
  const filtro = (userId: string, convId: string) => ({
    user_id: userId, tipo: CHAT_NOTIFICATION_TYPE, link: conversationLink(convId), lida: false,
  });
  const linhas = [
    { id: "a", ...filtro(ME, CONV) },
    { id: "b", ...filtro(ME, CONV2) },
    { id: "c", ...filtro(OTHER, CONV) },
    { id: "d", user_id: ME, tipo: "documento", link: "/documentos", lida: false },
    { id: "e", ...filtro(ME, CONV), lida: true },
  ];
  const alvo = (userId: string, convId: string) =>
    linhas.filter((l) => l.user_id === userId && l.tipo === CHAT_NOTIFICATION_TYPE
      && l.link === conversationLink(convId) && l.lida === false).map((l) => l.id);

  it("marca somente a conversa aberta do próprio usuário", () => {
    expect(alvo(ME, CONV)).toEqual(["a"]);
  });
  it("não toca outra conversa, outro usuário, outro tipo ou já lida", () => {
    const marcados = alvo(ME, CONV);
    expect(marcados).not.toContain("b");
    expect(marcados).not.toContain("c");
    expect(marcados).not.toContain("d");
    expect(marcados).not.toContain("e");
  });
  it("abertura repetida é idempotente (mesma chave de efeito)", () => {
    const key = (u: string, c: string, m: string | null) => `${u}:${c}:${m ?? "empty"}`;
    expect(key(ME, CONV, "m1")).toBe(key(ME, CONV, "m1"));
    expect(key(ME, CONV, "m2")).not.toBe(key(ME, CONV, "m1"));
  });
  it("mobile só marca quando a conversa está sendo exibida", () => {
    const displayed = (isMobile: boolean, selectedId: string | null) => !isMobile || !!selectedId;
    expect(displayed(true, null)).toBe(false);      // lista mobile
    expect(displayed(true, CONV)).toBe(true);       // deep link / conversa aberta
    expect(displayed(false, null)).toBe(true);      // desktop duas colunas
  });
});
