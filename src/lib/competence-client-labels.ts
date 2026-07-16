// Tradução dos status internos da competência para linguagem simples exibida
// ao cliente no portal (Fase 3). Nunca expõe termos técnicos.

import type { OfficialStatus } from "./competence-status";

export const CLIENT_STATUS_LABEL: Record<OfficialStatus, string> = {
  open: "Ainda não iniciada",
  in_progress: "Em andamento",
  awaiting_client: "Aguardando você",
  in_review: "Em conferência",
  completed: "Concluída",
  reopened: "Reaberta para ajustes",
};

export const CLIENT_STATUS_TONE: Record<OfficialStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-800",
  awaiting_client: "bg-amber-100 text-amber-800",
  in_review: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-800",
  reopened: "bg-orange-100 text-orange-800",
};

export function clientStatusLabel(s: string | null | undefined): string {
  if (!s) return "Ainda não iniciada";
  return CLIENT_STATUS_LABEL[s as OfficialStatus] ?? "Em andamento";
}

export function clientStatusTone(s: string | null | undefined): string {
  if (!s) return "bg-slate-100 text-slate-700";
  return CLIENT_STATUS_TONE[s as OfficialStatus] ?? "bg-blue-100 text-blue-800";
}

// Rótulos simples para as ações pendentes do cliente.
export const CLIENT_REQUEST_LABEL: Record<string, string> = {
  pendente: "Aguardando envio",
  solicitado: "Aguardando envio",
  aguardando_cliente: "Aguardando envio",
  reenviar: "Reenviar",
  em_analise: "Em análise",
  em_andamento: "Em análise",
  concluida: "Concluída",
  concluido: "Concluída",
  recebido: "Recebido",
  aprovada: "Aprovada",
  entregue: "Entregue",
};

export function clientRequestLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return CLIENT_REQUEST_LABEL[s] ?? s;
}

// Timeline: rótulos amigáveis para os tipos públicos permitidos na RPC.
export const CLIENT_TIMELINE_LABEL: Record<string, string> = {
  documento_enviado: "Documento enviado",
  documento_recebido: "Documento recebido",
  solicitacao_criada: "Solicitação criada",
  solicitacao_concluida: "Solicitação concluída",
  guia_criada: "Guia disponibilizada",
  guia_disponibilizada: "Guia disponibilizada",
  guia_paga: "Guia paga",
  processo_aberto: "Processo aberto",
  processo_status: "Processo atualizado",
  processo_solicitacao_criada: "Nova solicitação do processo",
  processo_requisito_atendido_solicitacao: "Requisito atendido",
  competencia_iniciada: "Competência iniciada",
  competencia_enviada_revisao: "Competência enviada para conferência",
  competencia_concluida: "Competência concluída",
  competencia_reaberta: "Competência reaberta",
};

export function clientTimelineLabel(t: string): string {
  return CLIENT_TIMELINE_LABEL[t] ?? "Atualização";
}
