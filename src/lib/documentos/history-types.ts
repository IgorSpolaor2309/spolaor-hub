// Fase 6 — contrato do histórico 1:N de arquivos das solicitações.
// Derivado de list_document_request_files_staff / _client (SECURITY DEFINER,
// whitelist explícita de colunas no banco). `storage_path` nunca aparece aqui.

export type SubmissionType = "original" | "reenvio" | "arquivo_final" | "reaproveitado";

export type StaffFileVersion = {
  id: string;
  version_number: number;
  document_id: string;
  document_name: string | null;
  document_tipo: string | null;
  document_competencia: string | null;
  data_validade: string | null;
  submitted_at: string;
  submitted_by_name: string | null;
  submitted_by_role: "admin" | "collaborator" | "client" | "system";
  submission_type: SubmissionType;
  request_status_at: string | null;
  active: boolean;
  is_demo: boolean;
};

export type ClientFileVersion = {
  id: string;
  version_number: number;
  document_id: string;
  document_name: string | null;
  submitted_at: string;
  active: boolean;
  /** "Primeiro envio" | "Reenvio 1" | "Arquivo da contabilidade" */
  label: string;
};

export const SUBMISSION_TYPE_LABEL: Record<SubmissionType, string> = {
  original: "Primeiro envio",
  reenvio: "Reenvio",
  arquivo_final: "Arquivo final da contabilidade",
  reaproveitado: "Documento reaproveitado",
};

export const SUBMITTED_BY_ROLE_LABEL: Record<StaffFileVersion["submitted_by_role"], string> = {
  admin: "Administrador",
  collaborator: "Colaborador",
  client: "Cliente",
  system: "Migração",
};

export type ReusableDocument = {
  document_id: string;
  nome: string | null;
  tipo: string | null;
  categoria: string | null;
  competencia: string | null;
  data_validade: string | null;
  created_at: string;
  is_demo: boolean;
  linked_requests: number;
  linked_processes: number;
};

export type ReusableDocumentPage = {
  items: ReusableDocument[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export const HISTORY_QK = {
  staff: (requestId: string) => ["doc-request-files", "staff", requestId] as const,
  client: (requestId: string) => ["doc-request-files", "client", requestId] as const,
  reusable: (args: Record<string, unknown>) => ["reusable-documents", args] as const,
};
