// Contrato da visão consolidada "O que preciso fazer" (cliente).
// Deriva exclusivamente da RPC SECURITY DEFINER public.client_list_pending_actions.
// Campos internos (observacoes_internas, storage_path, responsavel_*, demo_batch_id)
// NUNCA fazem parte deste payload.

export type ClientPendingKind = "document_request" | "tax_guide";

export type ClientPendingRow = {
  item_id: string;
  item_kind: ClientPendingKind;
  client_id: string;
  empresa_nome: string | null;
  empresa_label: string | null;
  titulo: string;
  categoria: string | null;
  competencia: string | null;
  status: string;
  status_label: string;
  prazo: string | null;
  urgency: string | null;
  is_demo: boolean;
  action_owner: string;
  updated_at: string;
};

export type ClientPendingCounts = {
  aguardando_envio: number;
  reenvio_solicitado: number;
  guias: number;
  atrasados: number;
  todos: number;
};

export type ClientPendingPayload = {
  rows: ClientPendingRow[];
  counts: ClientPendingCounts;
  page: number;
  page_size: number;
  total: number;
};

export const CLIENT_PENDINGS_QK = {
  root: ["client-pendings"] as const,
  list: (args: Record<string, unknown>) => ["client-pendings", "list", args] as const,
};

export const EMPTY_CLIENT_PENDING_COUNTS: ClientPendingCounts = {
  aguardando_envio: 0,
  reenvio_solicitado: 0,
  guias: 0,
  atrasados: 0,
  todos: 0,
};
