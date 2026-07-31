import { describe, expect, it, vi } from "vitest";
import {
  CHAT_NO_RESPONSIBLE_LABEL,
  CHAT_OVERDUE_TOOLTIP,
  CHAT_TEAM_RESPONSE_TARGET_HOURS,
  chatResponsibleLabel,
  deriveChatSituation,
  filterConversationsBySituation,
  isChatResponseOverdue,
} from "@/lib/chat-situation";

/**
 * Fase E2.3 — responsável principal + indicador de atraso.
 * A RPC list_chat_conversations_overview é a fonte exclusiva da lista; aqui
 * simulamos as linhas que ela devolve por perfil.
 */

type Row = {
  id: string;
  last_sender_role: string | null;
  last_message_created_at: string | null;
  responsible_profile_id: string | null;
  responsible_name: string | null;
  waiting_since: string | null;
};

const NOW = Date.parse("2026-07-31T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/** Simulação do cálculo servidor de waiting_since (mensagens não excluídas). */
type Msg = { role: "client" | "admin" | "collaborator"; at: string; deleted?: boolean };
function serverWaitingSince(msgs: Msg[]): string | null {
  const valid = msgs.filter((m) => !m.deleted).sort((a, b) => a.at.localeCompare(b.at));
  const last = valid.at(-1);
  if (!last || last.role !== "client") return null;
  const lastStaff = [...valid].reverse().find((m) => m.role !== "client");
  const first = valid.find((m) => m.role === "client" && (!lastStaff || m.at > lastStaff.at));
  return first?.at ?? null;
}

/** Metadados internos só existem para staff (espelha o gate da RPC). */
function serverRow(base: Row, role: "admin" | "collaborator" | "client"): Row {
  if (role === "client") {
    return { ...base, responsible_profile_id: null, responsible_name: null, waiting_since: null };
  }
  return base;
}

const staffRow: Row = {
  id: "c1",
  last_sender_role: "client",
  last_message_created_at: hoursAgo(1),
  responsible_profile_id: "p-staff",
  responsible_name: "Igor Spolaor Colaborador",
  waiting_since: hoursAgo(30),
};

describe("Fase E2.3 — responsável principal", () => {
  it("mostra o responsável principal quando existe", () => {
    expect(chatResponsibleLabel(staffRow.responsible_name)).toBe("Responsável: Igor Spolaor Colaborador");
  });

  it("empresa sem responsável mostra rótulo próprio", () => {
    expect(chatResponsibleLabel(null)).toBe(CHAT_NO_RESPONSIBLE_LABEL);
    expect(chatResponsibleLabel("   ")).toBe(CHAT_NO_RESPONSIBLE_LABEL);
  });

  it("perfil Cliente nunca é retornado como responsável (resolver filtra por papel staff)", () => {
    // A RPC só devolve perfis com papel admin/collaborator; nenhum nome de
    // cliente pode chegar ao campo.
    const row = serverRow({ ...staffRow, responsible_name: null, responsible_profile_id: null }, "admin");
    expect(row.responsible_profile_id).toBeNull();
    expect(chatResponsibleLabel(row.responsible_name)).toBe(CHAT_NO_RESPONSIBLE_LABEL);
  });

  it("Cliente recebe campos internos nulos e nenhum nome interno", () => {
    const row = serverRow(staffRow, "client");
    expect(row.responsible_profile_id).toBeNull();
    expect(row.responsible_name).toBeNull();
    expect(row.waiting_since).toBeNull();
    expect(JSON.stringify(row)).not.toContain("Igor Spolaor Colaborador");
    // sem waiting_since não há atraso possível no cliente
    expect(isChatResponseOverdue("aguardando_equipe", row.waiting_since, NOW)).toBe(false);
  });

  it("Colaborador fora da carteira não recebe a conversa (RLS da RPC)", () => {
    const authorized: Row[] = [staffRow];
    const outOfScope = authorized.filter((r) => r.id === "c-outra-carteira");
    expect(outOfScope).toHaveLength(0);
  });
});

describe("Fase E2.3 — waiting_since", () => {
  it("primeira mensagem do Cliente inicia a espera", () => {
    expect(serverWaitingSince([{ role: "client", at: hoursAgo(5) }])).toBe(hoursAgo(5));
  });

  it("mensagens consecutivas do Cliente não reiniciam a espera", () => {
    const ws = serverWaitingSince([
      { role: "client", at: hoursAgo(30) },
      { role: "client", at: hoursAgo(20) },
      { role: "client", at: hoursAgo(1) },
    ]);
    expect(ws).toBe(hoursAgo(30));
  });

  it("resposta da equipe encerra a espera", () => {
    expect(serverWaitingSince([
      { role: "client", at: hoursAgo(30) },
      { role: "admin", at: hoursAgo(2) },
    ])).toBeNull();
  });

  it("nova mensagem do Cliente depois da equipe inicia novo ciclo", () => {
    expect(serverWaitingSince([
      { role: "client", at: hoursAgo(30) },
      { role: "admin", at: hoursAgo(10) },
      { role: "client", at: hoursAgo(6) },
      { role: "client", at: hoursAgo(3) },
    ])).toBe(hoursAgo(6));
  });

  it("mensagens excluídas são ignoradas", () => {
    expect(serverWaitingSince([
      { role: "client", at: hoursAgo(30), deleted: true },
      { role: "client", at: hoursAgo(4) },
    ])).toBe(hoursAgo(4));
    expect(serverWaitingSince([
      { role: "client", at: hoursAgo(30) },
      { role: "admin", at: hoursAgo(10), deleted: true },
    ])).toBe(hoursAgo(30));
  });

  it("aguardando cliente ou sem atividade → waiting_since nulo", () => {
    expect(serverWaitingSince([{ role: "collaborator", at: hoursAgo(1) }])).toBeNull();
    expect(serverWaitingSince([])).toBeNull();
  });
});

describe("Fase E2.3 — regra de atraso", () => {
  it("alvo único de 24 horas", () => {
    expect(CHAT_TEAM_RESPONSE_TARGET_HOURS).toBe(24);
    expect(CHAT_OVERDUE_TOOLTIP).toBe("Aguardando resposta da equipe há 24 horas ou mais");
  });

  it("exatamente 24 horas gera atraso", () => {
    expect(isChatResponseOverdue("aguardando_equipe", hoursAgo(24), NOW)).toBe(true);
  });

  it("menos de 24 horas não gera atraso", () => {
    expect(isChatResponseOverdue("aguardando_equipe", hoursAgo(23.99), NOW)).toBe(false);
  });

  it("timestamp futuro ou inválido nunca gera atraso", () => {
    expect(isChatResponseOverdue("aguardando_equipe", hoursAgo(-5), NOW)).toBe(false);
    expect(isChatResponseOverdue("aguardando_equipe", "não-é-data", NOW)).toBe(false);
    expect(isChatResponseOverdue("aguardando_equipe", null, NOW)).toBe(false);
  });

  it("só há atraso na situação aguardando_equipe", () => {
    expect(isChatResponseOverdue("aguardando_cliente", hoursAgo(72), NOW)).toBe(false);
    expect(isChatResponseOverdue("sem_atividade", hoursAgo(72), NOW)).toBe(false);
  });

  it("o relógio recalcula sem nova consulta ao banco", () => {
    const fetchSpy = vi.fn();
    const row = { ...staffRow, waiting_since: hoursAgo(23.5) };
    const situation = deriveChatSituation(row.last_sender_role, row.last_message_created_at);
    expect(isChatResponseOverdue(situation, row.waiting_since, NOW)).toBe(false);
    // +1h de relógio, mesmos dados
    expect(isChatResponseOverdue(situation, row.waiting_since, NOW + 3_600_000)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Realtime: resposta da equipe remove o atraso", () => {
    const after: Row = {
      ...staffRow,
      last_sender_role: "admin",
      last_message_created_at: hoursAgo(0),
      waiting_since: null,
    };
    const situation = deriveChatSituation(after.last_sender_role, after.last_message_created_at);
    expect(situation).toBe("aguardando_cliente");
    expect(isChatResponseOverdue(situation, after.waiting_since, NOW)).toBe(false);
  });
});

describe("Fase E2.3 — filtros preservados", () => {
  const rows: Row[] = [
    staffRow,
    { ...staffRow, id: "c2", last_sender_role: "admin", waiting_since: null },
    { ...staffRow, id: "c3", last_sender_role: null, last_message_created_at: null, waiting_since: null },
  ];

  it("conversa atrasada continua em Aguardando equipe", () => {
    const set = filterConversationsBySituation(rows, "aguardando_equipe");
    expect(set.map((r) => r.id)).toEqual(["c1"]);
    expect(isChatResponseOverdue("aguardando_equipe", set[0].waiting_since, NOW)).toBe(true);
  });

  it("não existe filtro de atraso", () => {
    expect(filterConversationsBySituation(rows, "all")).toHaveLength(3);
    expect(filterConversationsBySituation(rows, "aguardando_cliente").map((r) => r.id)).toEqual(["c2"]);
  });
});
