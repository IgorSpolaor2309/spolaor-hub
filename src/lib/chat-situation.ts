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

/* ------------------------------------------------------------------ *
 * Fase E2.2 — filtro operacional por situação (staff)                 *
 * ------------------------------------------------------------------ */

/** "all" nunca vai para a URL: ausência do parâmetro = Todas. */
export type ChatSituationFilter = "all" | "aguardando_equipe" | "aguardando_cliente";

export const CHAT_SITUATION_FILTERS: { value: ChatSituationFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "aguardando_equipe", label: CHAT_SITUATION_LABELS.aguardando_equipe },
  { value: "aguardando_cliente", label: CHAT_SITUATION_LABELS.aguardando_cliente },
];

/** Valor inválido/ausente → "all". */
export function parseChatSituationFilter(v: unknown): ChatSituationFilter {
  return v === "aguardando_equipe" || v === "aguardando_cliente" ? v : "all";
}

/** Serializa para a URL: "all" vira undefined (parâmetro removido). */
export function serializeChatSituationFilter(f: ChatSituationFilter): string | undefined {
  return f === "all" ? undefined : f;
}

/** Estado vazio por filtro — mesma linguagem da tela. */
export function chatSituationEmptyMessage(f: ChatSituationFilter): string {
  if (f === "aguardando_equipe") return "Nenhuma conversa aguardando a equipe.";
  if (f === "aguardando_cliente") return "Nenhuma conversa aguardando o cliente.";
  return "Nenhuma conversa ainda.";
}

/**
 * Aplica o filtro sobre metadados já autorizados pela RPC/RLS.
 * Regra de situação vem sempre de deriveChatSituation — sem duplicação.
 */
export function filterConversationsBySituation<
  T extends { last_sender_role?: ChatSenderRole; last_message_created_at?: string | null },
>(rows: T[], filter: ChatSituationFilter): T[] {
  if (filter === "all") return rows;
  return rows.filter(
    (r) => deriveChatSituation(r.last_sender_role, r.last_message_created_at) === filter,
  );
}

/* ------------------------------------------------------------------ *
 * Fase E2.3 — responsável principal e indicador de atraso (staff)     *
 * ------------------------------------------------------------------ */

/** Alvo único de resposta da equipe (horas corridas). Sem SLA no banco. */
export const CHAT_TEAM_RESPONSE_TARGET_HOURS = 24;

/** Texto exibido quando a empresa não tem responsável principal válido. */
export const CHAT_NO_RESPONSIBLE_LABEL = "Sem responsável principal";

export const CHAT_OVERDUE_TOOLTIP = `Aguardando resposta da equipe há ${CHAT_TEAM_RESPONSE_TARGET_HOURS} horas ou mais`;

/* ------------------------------------------------------------------ *
 * Fase E2.4 — situação operacional da empresa (derivada, sem coluna)  *
 * ------------------------------------------------------------------ */

/** Espelho do campo derivado devolvido pela RPC (NULL para o perfil Cliente). */
export type ClientOperationalStatus = "active" | "inactive" | "deleted";

export const CLIENT_OPERATIONAL_STATUS_LABELS: Record<Exclude<ClientOperationalStatus, "active">, string> = {
  inactive: "Empresa inativa",
  deleted: "Empresa excluída",
};

/** Só empresa operacional (ativa) entra no cálculo de atraso. */
export function isClientOperational(status: string | null | undefined): boolean {
  // Cliente recebe NULL: nesse perfil não há indicador de atraso na interface.
  return status === "active";
}

/** Rótulo do aviso interno; null quando não há nada a sinalizar. */
export function clientOperationalNotice(status: string | null | undefined): string | null {
  if (status === "inactive" || status === "deleted") {
    return CLIENT_OPERATIONAL_STATUS_LABELS[status];
  }
  return null;
}

/**
 * Função pura de atraso. Só há atraso quando a conversa está aguardando a
 * equipe, `waitingSince` é um timestamp válido e no passado, a espera já
 * atingiu (>=) o alvo e a empresa está operacionalmente ativa (Fase E2.4).
 * Sem fim de semana/feriado/expediente nesta fase.
 */
export function isChatResponseOverdue(
  situation: ChatSituation,
  waitingSince: string | null | undefined,
  now: number = Date.now(),
  clientOperationalStatus: string | null | undefined = "active",
): boolean {
  if (situation !== "aguardando_equipe") return false;
  if (!isClientOperational(clientOperationalStatus)) return false;
  if (!waitingSince) return false;
  const started = new Date(waitingSince).getTime();
  if (!Number.isFinite(started)) return false;
  if (started > now) return false; // timestamp futuro nunca gera atraso
  return now - started >= CHAT_TEAM_RESPONSE_TARGET_HOURS * 3_600_000;
}


/** Rótulo do responsável para a lista/cabeçalho (somente staff). */
export function chatResponsibleLabel(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? `Responsável: ${trimmed}` : CHAT_NO_RESPONSIBLE_LABEL;
}
