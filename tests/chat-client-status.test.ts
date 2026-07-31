import { describe, expect, it } from "vitest";
import {
  CLIENT_OPERATIONAL_STATUS_LABELS,
  clientOperationalNotice,
  deriveChatSituation,
  filterConversationsBySituation,
  isChatResponseOverdue,
  isClientOperational,
} from "@/lib/chat-situation";

/**
 * Fase E2.4 — empresa inativa/excluída continua na operação de Mensagens,
 * apenas sinalizada e fora do cálculo de atraso de 24 horas.
 */

type Row = {
  id: string;
  last_sender_role: string | null;
  last_message_created_at: string | null;
  waiting_since: string | null;
  client_operational_status: string | null;
  razao_social: string;
};

const NOW = Date.parse("2026-07-31T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** Espelho do CASE da RPC: derivado de clients.status + deleted_at, staff-only. */
function serverOperationalStatus(
  client: { status: string; deleted_at: string | null },
  role: "admin" | "collaborator" | "client",
): string | null {
  if (role === "client") return null;
  if (client.deleted_at !== null) return "deleted";
  return client.status === "active" ? "active" : "inactive";
}

const base: Row = {
  id: "c1",
  last_sender_role: "client",
  last_message_created_at: hoursAgo(1),
  waiting_since: hoursAgo(30),
  client_operational_status: "active",
  razao_social: "SPOLAOR CONSULTORIA",
};

const situationOf = (r: Row) => deriveChatSituation(r.last_sender_role, r.last_message_created_at);
const overdue = (r: Row, now = NOW) =>
  isChatResponseOverdue(situationOf(r), r.waiting_since, now, r.client_operational_status);

describe("Fase E2.4 — derivação do status operacional", () => {
  it("empresa operacional → active", () => {
    expect(serverOperationalStatus({ status: "active", deleted_at: null }, "admin")).toBe("active");
  });

  it("empresa inativa → inactive", () => {
    expect(serverOperationalStatus({ status: "inactive", deleted_at: null }, "collaborator")).toBe("inactive");
  });

  it("empresa excluída logicamente → deleted (mesmo com status active)", () => {
    expect(serverOperationalStatus({ status: "active", deleted_at: hoursAgo(2) }, "admin")).toBe("deleted");
  });

  it("perfil Cliente recebe NULL (sem metadado operacional no payload)", () => {
    const row = { ...base, client_operational_status: serverOperationalStatus({ status: "inactive", deleted_at: null }, "client") };
    expect(row.client_operational_status).toBeNull();
    expect(clientOperationalNotice(row.client_operational_status)).toBeNull();
    expect(JSON.stringify(row)).not.toContain("inactive");
  });
});

describe("Fase E2.4 — cálculo de atraso", () => {
  it("empresa ativa aguardando equipe há 24h → atrasada", () => {
    expect(overdue({ ...base, waiting_since: hoursAgo(24) })).toBe(true);
  });

  it("empresa inativa na mesma condição → não atrasada", () => {
    expect(overdue({ ...base, client_operational_status: "inactive" })).toBe(false);
  });

  it("empresa excluída → não atrasada", () => {
    expect(overdue({ ...base, client_operational_status: "deleted" })).toBe(false);
  });

  it("Cliente (status nulo) nunca vê atraso", () => {
    expect(overdue({ ...base, client_operational_status: null })).toBe(false);
  });

  it("reativação permite recalcular o atraso imediatamente, sem tocar em waiting_since", () => {
    const inativa: Row = { ...base, client_operational_status: "inactive" };
    expect(overdue(inativa)).toBe(false);
    const reativada: Row = { ...inativa, client_operational_status: "active" };
    expect(reativada.waiting_since).toBe(inativa.waiting_since);
    expect(overdue(reativada)).toBe(true);
  });

  it("menos de 24h continua sem atraso mesmo em empresa ativa", () => {
    expect(overdue({ ...base, waiting_since: hoursAgo(23) })).toBe(false);
  });

  it("isClientOperational só aceita active", () => {
    expect(isClientOperational("active")).toBe(true);
    expect(isClientOperational("inactive")).toBe(false);
    expect(isClientOperational("deleted")).toBe(false);
    expect(isClientOperational(null)).toBe(false);
  });
});

describe("Fase E2.4 — situação, filtros e busca preservados", () => {
  const rows: Row[] = [
    base,
    { ...base, id: "c2", client_operational_status: "inactive", razao_social: "EMPRESA INATIVA LTDA" },
    { ...base, id: "c3", last_sender_role: "admin", waiting_since: null },
  ];

  it("empresa inativa continua em Aguardando equipe", () => {
    expect(situationOf(rows[1])).toBe("aguardando_equipe");
    expect(filterConversationsBySituation(rows, "aguardando_equipe").map((r) => r.id)).toEqual(["c1", "c2"]);
  });

  it("empresa inativa continua em Todas e na busca", () => {
    expect(filterConversationsBySituation(rows, "all")).toHaveLength(3);
    const term = "inativa";
    expect(rows.filter((r) => r.razao_social.toLowerCase().includes(term)).map((r) => r.id)).toEqual(["c2"]);
  });

  it("status da empresa não altera a situação derivada pelo último remetente", () => {
    expect(situationOf({ ...rows[2], client_operational_status: "deleted" })).toBe("aguardando_cliente");
  });

  it("nenhuma conversa é arquivada ou removida da lista", () => {
    expect(rows).toHaveLength(3);
    expect(filterConversationsBySituation(rows, "all").map((r) => r.id)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("Fase E2.4 — badges internos", () => {
  it("staff vê o aviso da empresa inativa/excluída", () => {
    expect(clientOperationalNotice("inactive")).toBe("Empresa inativa");
    expect(clientOperationalNotice("deleted")).toBe("Empresa excluída");
    expect(CLIENT_OPERATIONAL_STATUS_LABELS.inactive).toBe("Empresa inativa");
  });

  it("empresa ativa não gera aviso (linha não cresce sem necessidade)", () => {
    expect(clientOperationalNotice("active")).toBeNull();
    expect(clientOperationalNotice(undefined)).toBeNull();
  });

  it("total de atrasadas cai de 2 para 1 quando uma empresa fica inativa", () => {
    const antes: Row[] = [base, { ...base, id: "c2" }];
    expect(antes.filter((r) => overdue(r))).toHaveLength(2);
    const depois = antes.map((r) => (r.id === "c2" ? { ...r, client_operational_status: "inactive" } : r));
    expect(depois.filter((r) => overdue(r))).toHaveLength(1);
    expect(depois).toHaveLength(2); // nenhuma conversa some
  });
});
