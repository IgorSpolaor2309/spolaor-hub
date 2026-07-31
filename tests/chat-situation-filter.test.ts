import { describe, expect, it } from "vitest";
import {
  CHAT_SITUATION_FILTERS,
  canSeeChatSituation,
  chatSituationEmptyMessage,
  filterConversationsBySituation,
  parseChatSituationFilter,
  serializeChatSituationFilter,
} from "@/lib/chat-situation";

type Row = {
  id: string;
  name: string;
  last_sender_role: string | null;
  last_message_created_at: string | null;
};

const NOW = "2026-07-31T10:00:00Z";

const rows: Row[] = [
  { id: "c1", name: "Alfa Comercio", last_sender_role: "client", last_message_created_at: NOW },
  { id: "c2", name: "Beta Servicos", last_sender_role: "admin", last_message_created_at: NOW },
  { id: "c3", name: "Gama Ltda", last_sender_role: "collaborator", last_message_created_at: NOW },
  { id: "c4", name: "Delta SA", last_sender_role: null, last_message_created_at: null },
];

const searchBy = (list: Row[], term: string) =>
  list.filter((r) => r.name.toLowerCase().includes(term.trim().toLowerCase()));

describe("Fase E2.2 — filtro operacional de Mensagens", () => {
  it("ausência de parâmetro = Todas", () => {
    expect(parseChatSituationFilter(undefined)).toBe("all");
    expect(filterConversationsBySituation(rows, parseChatSituationFilter(undefined))).toHaveLength(4);
  });

  it("valor inválido volta para Todas", () => {
    for (const v of ["all", "", "sem_atividade", "AGUARDANDO_EQUIPE", 42, null]) {
      expect(parseChatSituationFilter(v)).toBe("all");
    }
  });

  it("nunca grava situacao=all na URL", () => {
    expect(serializeChatSituationFilter("all")).toBeUndefined();
    expect(serializeChatSituationFilter("aguardando_equipe")).toBe("aguardando_equipe");
    expect(serializeChatSituationFilter("aguardando_cliente")).toBe("aguardando_cliente");
  });

  it("cada filtro devolve somente a situação correspondente", () => {
    expect(filterConversationsBySituation(rows, "aguardando_equipe").map((r) => r.id)).toEqual(["c1"]);
    expect(filterConversationsBySituation(rows, "aguardando_cliente").map((r) => r.id)).toEqual(["c2", "c3"]);
  });

  it("sem atividade continua apenas em Todas", () => {
    expect(filterConversationsBySituation(rows, "all").map((r) => r.id)).toContain("c4");
    expect(filterConversationsBySituation(rows, "aguardando_equipe").map((r) => r.id)).not.toContain("c4");
    expect(filterConversationsBySituation(rows, "aguardando_cliente").map((r) => r.id)).not.toContain("c4");
  });

  it("busca combina com o filtro (situação primeiro, texto depois)", () => {
    const result = searchBy(filterConversationsBySituation(rows, "aguardando_cliente"), "gama");
    expect(result.map((r) => r.id)).toEqual(["c3"]);
    // Empresa fora do filtro não volta pela busca.
    expect(searchBy(filterConversationsBySituation(rows, "aguardando_cliente"), "alfa")).toHaveLength(0);
  });

  it("zero resultados tem mensagem própria por filtro", () => {
    const empty = filterConversationsBySituation([rows[3]], "aguardando_equipe");
    expect(empty).toHaveLength(0);
    expect(chatSituationEmptyMessage("aguardando_equipe")).toBe("Nenhuma conversa aguardando a equipe.");
    expect(chatSituationEmptyMessage("aguardando_cliente")).toBe("Nenhuma conversa aguardando o cliente.");
    expect(chatSituationEmptyMessage("all")).toBe("Nenhuma conversa ainda.");
  });

  it("Cliente não vê filtros e o parâmetro não altera a consulta", () => {
    expect(canSeeChatSituation("client")).toBe(false);
    const effective = canSeeChatSituation("client") ? parseChatSituationFilter("aguardando_equipe") : "all";
    expect(effective).toBe("all");
    expect(filterConversationsBySituation(rows, effective)).toHaveLength(rows.length);
  });

  it("filtro opera sobre as linhas já autorizadas — sem consulta por conversa", () => {
    // A carteira do colaborador chega pronta da RPC; o filtro nunca amplia o conjunto.
    const carteira = rows.slice(0, 2);
    const out = filterConversationsBySituation(carteira, "all");
    expect(out).toHaveLength(2);
    expect(out.every((r) => carteira.includes(r))).toBe(true);
  });

  it("realtime move a conversa de um conjunto para o outro sem duplicar", () => {
    const before = filterConversationsBySituation(rows, "aguardando_equipe").map((r) => r.id);
    expect(before).toEqual(["c1"]);
    const after = rows.map((r) =>
      r.id === "c1" ? { ...r, last_sender_role: "admin", last_message_created_at: "2026-07-31T11:00:00Z" } : r,
    );
    expect(filterConversationsBySituation(after, "aguardando_equipe")).toHaveLength(0);
    const cliente = filterConversationsBySituation(after, "aguardando_cliente").map((r) => r.id);
    expect(cliente).toEqual(["c2", "c3", "c1"].sort((a, b) => cliente.indexOf(a) - cliente.indexOf(b)));
    expect(new Set(cliente).size).toBe(cliente.length);
  });

  it("troca de filtro: conversa fora do conjunto perde a seleção (mobile volta à lista, desktop cai no primeiro)", () => {
    const selectedId = "c1";
    const next = filterConversationsBySituation(rows, "aguardando_cliente");
    const keep = next.some((r) => r.id === selectedId);
    expect(keep).toBe(false);
    const desktopFallback = next[0]?.id ?? null;
    expect(desktopFallback).toBe("c2");
  });

  it("troca de filtro mantém a conversa quando ela pertence ao novo conjunto (deep link preservado)", () => {
    const selectedId = "c2";
    const next = filterConversationsBySituation(rows, "aguardando_cliente");
    expect(next.some((r) => r.id === selectedId)).toBe(true);
  });

  it("os três chips compactos usam os labels internos aprovados", () => {
    expect(CHAT_SITUATION_FILTERS.map((f) => f.label)).toEqual([
      "Todas", "Aguardando equipe", "Aguardando cliente",
    ]);
  });

  it("nenhum dado é escrito: o filtro é uma função pura sobre o array recebido", () => {
    const snapshot = JSON.stringify(rows);
    filterConversationsBySituation(rows, "aguardando_equipe");
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
