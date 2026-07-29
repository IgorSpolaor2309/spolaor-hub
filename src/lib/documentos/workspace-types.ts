/**
 * Central de Documentos + Solicitações — contrato de dados (Fase 3).
 *
 * Estes tipos refletem o retorno de `list_document_workspace_paginated`
 * (staff, SECURITY INVOKER). O contrato completo está documentado em
 * docs/document-workspace-data-contract.md.
 */

export type WorkspaceTab =
  | "aguardando_cliente"
  | "recebidos"
  | "reenviar"
  | "concluidos"
  | "vinculados"
  | "vencendo"
  | "vencidos"
  | "todos"
  | "precisa_solicitar"; // tab client-side; nunca vai como _tab para a RPC

export const WORKSPACE_TABS: { value: WorkspaceTab; label: string }[] = [
  { value: "precisa_solicitar", label: "Precisa solicitar" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "recebidos", label: "Recebidos" },
  { value: "reenviar", label: "Reenviar" },
  { value: "concluidos", label: "Concluídos" },
  { value: "vinculados", label: "Vinculados" },
  { value: "vencendo", label: "Vencendo" },
  { value: "vencidos", label: "Vencidos" },
  { value: "todos", label: "Todos" },
];

/** Tabs que efetivamente disparam a RPC principal (todas menos "precisa_solicitar"). */
export const RPC_TABS: Exclude<WorkspaceTab, "precisa_solicitar">[] = [
  "aguardando_cliente", "recebidos", "reenviar", "concluidos",
  "vinculados", "vencendo", "vencidos", "todos",
];

export type WorkspaceRow = {
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
  status: "aguardando" | "recebido" | "reenviar" | "concluido" | "cancelado" | null;
  status_label: string;
  action_owner: "client" | "staff" | "none";
  prazo: string | null;
  data_validade: string | null;
  urgency: "baixa" | "normal" | "alta" | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  document_id: string | null;
  document_name: string | null;
  // Fase 7: `document_storage_path` foi removido do contrato.
  // O acesso ao arquivo é feito sob demanda via `getDocumentSignedUrl(document_id)`.
  has_document: boolean;
  has_process_link: boolean;
  links_count: number;
  company_process_id: string | null;
  company_process_step_id: string | null;
  company_process_step_requirement_id: string | null;
  process_type_name: string | null;
  process_step_name: string | null;
  is_expiring: boolean;
  is_expired: boolean;
  is_demo: boolean;
  demo_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceCounts = {
  aguardando_cliente: number;
  aguardando_equipe: number;
  recebidos: number;
  reenviar: number;
  concluidos: number;
  vencendo: number;
  vencidos: number;
  vinculados: number;
  sem_vinculo: number;
  todos: number;
};

export type WorkspacePayload = {
  rows: WorkspaceRow[];
  counts: WorkspaceCounts;
  page: number;
  page_size: number;
  total: number;
};

export type NeedToRequestDiagnostic = {
  elegiveis: number;
  ja_com_request_ativo: number;
  ja_com_documento: number;
  criterio: string;
};

/** Central único de query-keys da Central. */
export const WORKSPACE_QK = {
  root: ["doc-workspace"] as const,
  list: (params: unknown) => ["doc-workspace", "list", params] as const,
  needToRequest: (clientId: string | null, includeDemo: boolean) =>
    ["doc-workspace", "need-to-request", clientId, includeDemo] as const,
  clientsBrief: ["doc-workspace", "clients"] as const,
  responsaveis: ["doc-workspace", "responsaveis"] as const,
};
