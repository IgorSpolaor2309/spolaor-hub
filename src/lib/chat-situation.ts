/**
 * Fase E2.1 — situação derivada das conversas (Mensagens).
 *
 * Regra única, sem persistência no banco e sem trigger: a situação é sempre
 * calculada a partir do papel do remetente da última mensagem NÃO excluída.
 *
 *  - última mensagem de `client`                  → aguardando_equipe
 *  - última mensagem de `admin` / `collaborator`  → aguardando_cliente
 *  - nenhuma mensagem válida                      → sem_atividade
 *
 * A linguagem abaixo é INTERNA (Administrador/Colaborador). O perfil Cliente
 * não recebe badge operacional nesta fase.
 */

export type ChatSituation = "aguardando_equipe" | "aguardando_cliente" | "sem_atividade";

export type ChatSenderRole = "admin" | "collaborator" | "client" | "system" | string | null | undefined;

export const CHAT_SITUATION_LABELS: Record<ChatSituation, string> = {
  aguardando_equipe: "Aguardando equipe",
  aguardando_cliente: "Aguardando cliente",
  sem_atividade: "Sem atividade",
};

/** Tom visual (tokens semânticos, sem cores hardcoded de tema). */
export const CHAT_SITUATION_TONES: Record<ChatSituation, string> = {
  aguardando_equipe: "border-amber-300 bg-amber-100 text-amber-900",
  aguardando_cliente: "border-border bg-secondary text-secondary-foreground",
  sem_atividade: "border-border bg-muted text-muted-foreground",
};

/**
 * Deriva a situação. `lastMessageAt` é opcional: quando informado e nulo,
 * a conversa é tratada como sem atividade mesmo que venha um papel residual.
 */
export function deriveChatSituation(
  lastSenderRole: ChatSenderRole,
  lastMessageAt?: string | null,
): ChatSituation {
  if (lastMessageAt === null) return "sem_atividade";
  if (lastSenderRole === "client") return "aguardando_equipe";
  if (lastSenderRole === "admin" || lastSenderRole === "collaborator") return "aguardando_cliente";
  return "sem_atividade";
}

export function chatSituationLabel(situation: ChatSituation): string {
  return CHAT_SITUATION_LABELS[situation];
}

/** Só perfis internos veem a situação operacional. */
export function canSeeChatSituation(role: string | null | undefined): boolean {
  return role === "admin" || role === "collaborator";
}
