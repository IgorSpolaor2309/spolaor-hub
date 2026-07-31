/**
 * Fase E2.5 — regras puras do banner global de notificações.
 *
 * Nada aqui toca banco, rede ou React: são apenas decisões testáveis sobre
 * quais eventos Realtime viram aviso visual e quais links são navegáveis.
 */

export type NotificationRow = {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  lida: boolean;
  created_at: string;
};

export type NotificationEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Partial<NotificationRow> | null;
  old?: Partial<NotificationRow> | null;
};

/** Tipo canônico das notificações de Mensagens. */
export const CHAT_NOTIFICATION_TYPE = "chat";

/** Link canônico de uma conversa. Fonte única de comparação. */
export function conversationLink(conversationId: string): string {
  return `/interacoes?conversation=${conversationId}`;
}

/** Normaliza qualquer formato ativo de link de Mensagens para comparação. */
export function conversationIdFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const match = /^\/interacoes\?(?:.*&)?conversation=([0-9a-fA-F-]{36})(?:&|$)/.exec(link.trim());
  return match ? match[1] : null;
}

/**
 * Link interno seguro: sempre relativo à própria aplicação.
 * Rejeita domínio externo, protocolo e caminhos protocol-relative.
 */
export function isSafeInternalLink(link: string | null | undefined): boolean {
  if (!link) return false;
  const value = link.trim();
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^\/\\/.test(value)) return false;
  if (/[a-z][a-z0-9+.-]*:/i.test(value.split("?")[0])) return false;
  return true;
}

/** Marcador temporal de atividade usado na deduplicação e na ordenação. */
export function activityStamp(row: Partial<NotificationRow> | null | undefined): string {
  return row?.created_at ?? "";
}

/** Chave de deduplicação em memória: id + marcador temporal. */
export function bannerKey(row: Partial<NotificationRow> | null | undefined): string {
  return `${row?.id ?? ""}|${activityStamp(row)}`;
}

/**
 * Decide se um evento Realtime deve gerar banner.
 *
 *  - INSERT destinado ao usuário → sim.
 *  - UPDATE ainda não lido com marcador temporal avançado → sim (consolidação).
 *  - UPDATE de leitura (lida = true) ou sem nova atividade → não.
 *  - DELETE / outro usuário / linha ausente → não.
 */
export function shouldShowBanner(event: NotificationEvent, currentUserId: string | null): boolean {
  if (!currentUserId) return false;
  const row = event.new;
  if (!row || !row.id) return false;
  if (row.user_id !== currentUserId) return false;
  if (event.eventType === "INSERT") return row.lida !== true;
  if (event.eventType !== "UPDATE") return false;
  if (row.lida !== false) return false;
  const previous = activityStamp(event.old);
  const current = activityStamp(row);
  if (!current) return false;
  if (!previous) return true; // replica identity default: sem old, confia no não lido
  return current > previous;
}
