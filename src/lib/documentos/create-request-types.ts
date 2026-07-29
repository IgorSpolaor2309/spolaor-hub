/**
 * Criação direta de solicitações na Central de Documentos.
 * Contrato das RPCs `workspace_checklist_precisa_solicitar_list`,
 * `staff_create_document_request` e `staff_check_duplicate_document_request`.
 */

export type EligibleChecklistItem = {
  id: string;
  client_id: string;
  titulo: string;
  categoria: string | null;
  competencia: string | null;
  prazo: string | null;
  origem: string | null;
  is_demo: boolean;
  demo_batch_id: string | null;
  responsavel_profile_id: string | null;
  responsavel_nome: string | null;
  observacao: string | null;
  created_at: string;
  empresa_nome: string | null;
  empresa_documento: string | null;
};

export type EligiblePayload = {
  rows: EligibleChecklistItem[];
  total: number;
  page: number;
  page_size: number;
};

export type DuplicateHit = {
  id: string;
  titulo: string;
  status: string;
  competencia: string | null;
  categoria: string | null;
  tipo_solicitacao: string | null;
  created_at: string;
};

export type CreateRequestInput = {
  client_id: string;
  titulo: string;
  descricao?: string | null;
  competencia?: string | null;
  categoria?: string | null;
  tipo_solicitacao?: string | null;
  departamento?: string | null;
  prazo?: string | null;
  urgencia?: string | null;
  responsavel_profile_id?: string | null;
  observacoes_internas?: string | null;
  checklist_item_id?: string | null;
};

export const REQUEST_CATEGORIAS = [
  { value: "fiscal", label: "Fiscal" },
  { value: "contabil", label: "Contábil" },
  { value: "dp", label: "Departamento Pessoal" },
  { value: "financeiro", label: "Financeiro" },
  { value: "juridico", label: "Jurídico" },
  { value: "cadastro", label: "Cadastro" },
  { value: "outro", label: "Outro" },
];

export const REQUEST_TIPOS = [
  { value: "contrato_social", label: "Contrato Social" },
  { value: "alteracao_contratual", label: "Alteração Contratual" },
  { value: "balanco", label: "Balanço" },
  { value: "balancete", label: "Balancete" },
  { value: "folha_pagamento", label: "Folha de Pagamento" },
  { value: "comprovante_rendimentos", label: "Comprovante de Rendimentos" },
  { value: "declaracao_faturamento", label: "Declaração de Faturamento" },
  { value: "segunda_via_guia", label: "Segunda Via de Guia" },
  { value: "regularizacao", label: "Regularização" },
  { value: "outro", label: "Outro" },
];

export const REQUEST_DEPARTAMENTOS = [
  { value: "contabil", label: "Contábil" },
  { value: "fiscal", label: "Fiscal" },
  { value: "pessoal", label: "Pessoal / DP" },
  { value: "financeiro", label: "Financeiro" },
  { value: "juridico", label: "Jurídico" },
  { value: "cadastro", label: "Cadastro" },
  { value: "outro", label: "Outro" },
];

export const REQUEST_URGENCIAS = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];
