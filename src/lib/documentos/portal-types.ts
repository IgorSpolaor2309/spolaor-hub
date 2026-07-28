// Contrato do Portal do Cliente — Fase 5.
// Deriva de list_client_document_workspace_paginated (SECURITY DEFINER).
// Colunas internas (observacoes_internas, storage_path, responsavel_*,
// demo_batch_id, criado_por*) NUNCA fazem parte deste payload.

export type PortalSection = "precisa_enviar" | "historico";

export type PortalActionOwner = "client" | "staff" | "none";

export type PortalRow = {
  item_id: string;
  item_kind: "document_request" | "document";
  client_id: string;
  empresa_nome: string | null;
  empresa_documento: string | null;
  titulo: string;
  descricao_resumida: string | null;
  categoria: string | null;
  tipo: string | null;
  departamento: string | null;
  competencia: string | null;
  status: string | null;
  status_label: string;
  action_owner: PortalActionOwner;
  prazo: string | null;
  data_validade: string | null;
  urgency: string | null;
  document_id: string | null;
  document_name: string | null;
  has_document: boolean;
  has_process_link: boolean;
  company_process_id: string | null;
  process_type_name: string | null;
  is_expiring: boolean;
  is_expired: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type PortalCounts = {
  aguardando_voce: number;
  aguardando_contabilidade: number;
  em_analise: number;
  precisa_reenviar: number;
  concluidos: number;
  cancelados: number;
  todos: number;
};

export type PortalPayload = {
  rows: PortalRow[];
  counts: PortalCounts;
  page: number;
  page_size: number;
  total: number;
};

export const PORTAL_QK = {
  list: (args: Record<string, unknown>) => ["portal-docs", "list", args] as const,
  clients: ["portal-docs", "my-clients"] as const,
};
