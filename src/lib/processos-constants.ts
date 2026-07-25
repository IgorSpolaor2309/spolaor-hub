/**
 * Fonte única de verdade para status, prioridades e labels do módulo Processos.
 *
 * Valores técnicos batem com o schema/enum do banco. NÃO ALTERAR:
 * - process_status         (nao_iniciado, em_andamento, aguardando_cliente, aguardando_orgao, concluido, cancelado)
 * - process_step_status    (pendente, em_andamento, concluida, cancelada)
 * - process_priority       (baixa, media, alta, urgente)
 * - document_request_status(pendente, solicitado, em_andamento, aguardando_cliente, reenviar, recebido, concluido, recusado, cancelado)
 *
 * "audience" separa staff (contadores/colaboradores) do cliente final:
 * - staff  → linguagem operacional interna
 * - client → linguagem de portal (mais amigável, sem termos internos)
 */

export type Audience = "staff" | "client";

/* -------------------------------------------------------- Process status */

export const PROCESS_STATUS = {
  nao_iniciado:       { staff: "Não iniciado",       client: "Ainda não iniciado",        tone: "bg-zinc-200 text-zinc-700" },
  em_andamento:       { staff: "Em andamento",       client: "Em andamento",              tone: "bg-blue-100 text-blue-800" },
  aguardando_cliente: { staff: "Aguardando cliente", client: "Aguardando sua ação",       tone: "bg-amber-100 text-amber-800" },
  aguardando_orgao:   { staff: "Aguardando órgão",   client: "Aguardando análise externa", tone: "bg-orange-100 text-orange-800" },
  concluido:          { staff: "Concluído",          client: "Concluído",                 tone: "bg-emerald-100 text-emerald-800" },
  cancelado:          { staff: "Cancelado",          client: "Cancelado",                 tone: "bg-red-100 text-red-800" },
} as const;
export type ProcessStatus = keyof typeof PROCESS_STATUS;

// Tom específico do portal (algumas cores mais suaves foram usadas antes; mantidas).
const PROCESS_STATUS_TONE_CLIENT: Record<ProcessStatus, string> = {
  nao_iniciado:       "bg-zinc-100 text-zinc-700",
  em_andamento:       "bg-indigo-100 text-indigo-800",
  aguardando_cliente: "bg-amber-100 text-amber-800",
  aguardando_orgao:   "bg-sky-100 text-sky-800",
  concluido:          "bg-emerald-100 text-emerald-800",
  cancelado:          "bg-zinc-200 text-zinc-700",
};

// Rótulos em minúsculas para uso na timeline interna (ex.: "Status → em andamento.").
export const PROCESS_STATUS_LOWER: Record<ProcessStatus, string> = {
  nao_iniciado: "não iniciado",
  em_andamento: "em andamento",
  aguardando_cliente: "aguardando cliente",
  aguardando_orgao: "aguardando órgão",
  concluido: "concluído",
  cancelado: "cancelado",
};

export function isProcessStatus(v: unknown): v is ProcessStatus {
  return typeof v === "string" && v in PROCESS_STATUS;
}
export function getProcessStatusLabel(v: string | null | undefined, audience: Audience = "staff"): string {
  if (isProcessStatus(v)) return PROCESS_STATUS[v][audience];
  return v ?? "—";
}
export function getProcessStatusTone(v: string | null | undefined, audience: Audience = "staff"): string {
  if (isProcessStatus(v)) return audience === "client" ? PROCESS_STATUS_TONE_CLIENT[v] : PROCESS_STATUS[v].tone;
  return "bg-zinc-100 text-zinc-700";
}
export const PROCESS_STATUS_OPTIONS: { value: ProcessStatus; label: string }[] =
  (Object.keys(PROCESS_STATUS) as ProcessStatus[]).map((v) => ({ value: v, label: PROCESS_STATUS[v].staff }));

export function isProcessOpen(v: string | null | undefined): boolean {
  return v !== "concluido" && v !== "cancelado";
}

/* -------------------------------------------------------- Step status */

export const STEP_STATUS = {
  pendente:     { staff: "Pendente",     client: "Pendente",     tone: "bg-zinc-100 text-zinc-700" },
  em_andamento: { staff: "Em andamento", client: "Em andamento", tone: "bg-blue-100 text-blue-800" },
  concluida:    { staff: "Concluída",    client: "Concluída",    tone: "bg-emerald-100 text-emerald-800" },
  cancelada:    { staff: "Cancelada",    client: "Cancelada",    tone: "bg-red-100 text-red-800" },
} as const;
export type StepStatus = keyof typeof STEP_STATUS;

// Portal usa tom amber para "pendente" e outros compartilhados; consolidado aqui.
const STEP_STATUS_TONE_CLIENT: Record<StepStatus, string> = {
  pendente:     "bg-amber-100 text-amber-800",
  em_andamento: "bg-indigo-100 text-indigo-800",
  concluida:    "bg-emerald-100 text-emerald-800",
  cancelada:    "bg-zinc-200 text-zinc-700",
};

export const STEP_STATUS_LOWER: Record<StepStatus, string> = {
  pendente: "pendente",
  em_andamento: "em andamento",
  concluida: "concluída",
  cancelada: "cancelada",
};

export function isStepStatus(v: unknown): v is StepStatus {
  return typeof v === "string" && v in STEP_STATUS;
}
export function getStepStatusLabel(v: string | null | undefined, audience: Audience = "staff"): string {
  if (isStepStatus(v)) return STEP_STATUS[v][audience];
  return v ?? "—";
}
export function getStepStatusTone(v: string | null | undefined, audience: Audience = "staff"): string {
  if (isStepStatus(v)) return audience === "client" ? STEP_STATUS_TONE_CLIENT[v] : STEP_STATUS[v].tone;
  return "bg-zinc-100 text-zinc-700";
}
export const STEP_STATUS_OPTIONS: { value: StepStatus; label: string }[] =
  (Object.keys(STEP_STATUS) as StepStatus[]).map((v) => ({ value: v, label: STEP_STATUS[v].staff }));

/* -------------------------------------------------------- Priority */

export const PROCESS_PRIORITY = {
  baixa:   { staff: "Baixa",   tone: "bg-zinc-100 text-zinc-700" },
  media:   { staff: "Média",   tone: "bg-blue-100 text-blue-700" },
  alta:    { staff: "Alta",    tone: "bg-amber-100 text-amber-700" },
  urgente: { staff: "Urgente", tone: "bg-red-100 text-red-700" },
} as const;
export type ProcessPriority = keyof typeof PROCESS_PRIORITY;

export function isProcessPriority(v: unknown): v is ProcessPriority {
  return typeof v === "string" && v in PROCESS_PRIORITY;
}
export function getPriorityLabel(v: string | null | undefined): string {
  if (isProcessPriority(v)) return PROCESS_PRIORITY[v].staff;
  return v ?? "—";
}
export function getPriorityTone(v: string | null | undefined): string {
  if (isProcessPriority(v)) return PROCESS_PRIORITY[v].tone;
  return "bg-zinc-100 text-zinc-700";
}
export const PROCESS_PRIORITY_OPTIONS: { value: ProcessPriority; label: string }[] =
  (Object.keys(PROCESS_PRIORITY) as ProcessPriority[]).map((v) => ({ value: v, label: PROCESS_PRIORITY[v].staff }));

/* -------------------------------------------------------- Document request status */

export const REQUEST_STATUS = {
  pendente:           { staff: "Pendente",           client: "Pendente",         tone: "bg-amber-100 text-amber-800" },
  solicitado:         { staff: "Solicitado",         client: "Solicitado",       tone: "bg-sky-100 text-sky-800" },
  em_andamento:       { staff: "Em andamento",       client: "Em andamento",     tone: "bg-indigo-100 text-indigo-800" },
  aguardando_cliente: { staff: "Aguardando cliente", client: "Aguardando você",  tone: "bg-amber-100 text-amber-800" },
  reenviar:           { staff: "Reenviar",           client: "Reenviar",         tone: "bg-amber-100 text-amber-800" },
  recebido:           { staff: "Recebido",           client: "Recebido",         tone: "bg-emerald-100 text-emerald-800" },
  concluido:          { staff: "Concluído",          client: "Concluído",        tone: "bg-emerald-100 text-emerald-800" },
  recusado:           { staff: "Recusado",           client: "Recusado",         tone: "bg-rose-100 text-rose-800" },
  cancelado:          { staff: "Cancelado",          client: "Cancelado",        tone: "bg-zinc-200 text-zinc-700" },
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUS;

export function isRequestStatus(v: unknown): v is RequestStatus {
  return typeof v === "string" && v in REQUEST_STATUS;
}
export function getRequestStatusLabel(v: string | null | undefined, audience: Audience = "staff"): string {
  if (isRequestStatus(v)) return REQUEST_STATUS[v][audience];
  return v ?? "—";
}
export function getRequestStatusTone(v: string | null | undefined): string {
  if (isRequestStatus(v)) return REQUEST_STATUS[v].tone;
  return "bg-zinc-100 text-zinc-700";
}
