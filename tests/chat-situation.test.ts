import { describe, expect, it } from "vitest";
import {
  CHAT_SITUATION_LABELS,
  CHAT_SITUATION_TONES,
  canSeeChatSituation,
  chatSituationLabel,
  deriveChatSituation,
} from "@/lib/chat-situation";

describe("Fase E2.1 — situação derivada de Mensagens", () => {
  it("última mensagem do cliente → aguardando equipe", () => {
    expect(deriveChatSituation("client", "2026-07-30T10:00:00Z")).toBe("aguardando_equipe");
  });

  it("última mensagem de admin ou colaborador → aguardando cliente", () => {
    expect(deriveChatSituation("admin", "2026-07-30T10:00:00Z")).toBe("aguardando_cliente");
    expect(deriveChatSituation("collaborator", "2026-07-30T10:00:00Z")).toBe("aguardando_cliente");
  });

  it("conversa sem mensagem válida fica sem atividade", () => {
    expect(deriveChatSituation(null, null)).toBe("sem_atividade");
    expect(deriveChatSituation(undefined)).toBe("sem_atividade");
  });

  it("última mensagem excluída (RPC devolve papel nulo) é ignorada", () => {
    // A RPC só considera deleted_at IS NULL: uma conversa com todas as
    // mensagens excluídas volta com papel/timestamp nulos.
    expect(deriveChatSituation(null, null)).toBe("sem_atividade");
  });

  it("timestamp nulo prevalece sobre papel residual", () => {
    expect(deriveChatSituation("client", null)).toBe("sem_atividade");
  });

  it("papel system/desconhecido não gera situação operacional", () => {
    expect(deriveChatSituation("system", "2026-07-30T10:00:00Z")).toBe("sem_atividade");
    expect(deriveChatSituation("qualquer", "2026-07-30T10:00:00Z")).toBe("sem_atividade");
  });

  it("labels internos são exatamente os aprovados", () => {
    expect(CHAT_SITUATION_LABELS.aguardando_equipe).toBe("Aguardando equipe");
    expect(CHAT_SITUATION_LABELS.aguardando_cliente).toBe("Aguardando cliente");
    expect(CHAT_SITUATION_LABELS.sem_atividade).toBe("Sem atividade");
    expect(chatSituationLabel("aguardando_equipe")).toBe("Aguardando equipe");
  });

  it("todo estado tem tom visual definido", () => {
    for (const key of Object.keys(CHAT_SITUATION_LABELS)) {
      expect(CHAT_SITUATION_TONES[key as keyof typeof CHAT_SITUATION_TONES]).toBeTruthy();
    }
  });

  it("somente perfis internos veem a situação", () => {
    expect(canSeeChatSituation("admin")).toBe(true);
    expect(canSeeChatSituation("collaborator")).toBe(true);
    expect(canSeeChatSituation("client")).toBe(false);
    expect(canSeeChatSituation(null)).toBe(false);
  });
});
