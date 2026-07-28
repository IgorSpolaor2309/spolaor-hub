// Fase 2 — Status oficial de document_requests.
// Não usar status para indicar "quem precisa agir" — derive isso de criado_por_role,
// responsável ou origem. Não criar novos status paralelos.

export type DocRequestStatus =
  | "aguardando"
  | "recebido"
  | "reenviar"
  | "concluido"
  | "cancelado";

export const DOC_REQUEST_STATUSES: DocRequestStatus[] = [
  "aguardando",
  "recebido",
  "reenviar",
  "concluido",
  "cancelado",
];

export const DOC_REQUEST_STATUS_LABEL: Record<DocRequestStatus, string> = {
  aguardando: "Aguardando",
  recebido: "Recebido",
  reenviar: "Reenviar",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const DOC_REQUEST_STATUS_TONE: Record<DocRequestStatus, string> = {
  aguardando: "bg-amber-100 text-amber-800",
  recebido: "bg-sky-100 text-sky-800",
  reenviar: "bg-rose-100 text-rose-800",
  concluido: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-zinc-200 text-zinc-700",
};

/** Solicitações que estão em aberto (não concluídas nem canceladas). */
export const DOC_REQUEST_OPEN_STATUSES: DocRequestStatus[] = [
  "aguardando",
  "recebido",
  "reenviar",
];

/** Estados em que o cliente precisa enviar/reenviar algo. */
export const DOC_REQUEST_CLIENT_ACTION_STATUSES: DocRequestStatus[] = [
  "aguardando",
  "reenviar",
];

export function docRequestLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return DOC_REQUEST_STATUS_LABEL[status as DocRequestStatus] ?? status;
}

export function docRequestTone(status: string | null | undefined): string {
  if (!status) return "bg-zinc-100 text-zinc-700";
  return DOC_REQUEST_STATUS_TONE[status as DocRequestStatus] ?? "bg-zinc-100 text-zinc-700";
}
