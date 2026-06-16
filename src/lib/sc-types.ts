export type AppRole = "admin" | "collaborator" | "client";

export const TASK_STATUSES = [
  { value: "aberta", label: "A fazer" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "em_andamento", label: "Em execução" },
  { value: "em_revisao", label: "Em revisão" },
  { value: "concluida", label: "Concluída" },
  { value: "vencida", label: "Vencida" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export const KANBAN_COLUMNS = [
  { value: "aberta", label: "A fazer" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "em_andamento", label: "Em execução" },
  { value: "em_revisao", label: "Em revisão" },
  { value: "concluida", label: "Concluído" },
] as const;

export const DEPARTMENTS = [
  { value: "contabil", label: "Contábil" },
  { value: "fiscal", label: "Fiscal" },
  { value: "dp", label: "Departamento Pessoal" },
  { value: "financeiro", label: "Financeiro" },
  { value: "societario", label: "Societário" },
  { value: "atendimento", label: "Atendimento" },
  { value: "outros", label: "Outros" },
] as const;

export const TEMPLATE_CATEGORIES = [
  { value: "solicitacao_documentos", label: "Solicitação de documentos" },
  { value: "cobranca_pendencia", label: "Cobrança de pendência" },
  { value: "guia_disponivel", label: "Guia disponível" },
  { value: "lembrete_vencimento", label: "Lembrete de vencimento" },
  { value: "certificado_digital", label: "Certificado digital" },
  { value: "fechamento_mensal", label: "Fechamento mensal" },
  { value: "boas_vindas", label: "Boas-vindas" },
  { value: "primeiro_acesso", label: "Primeiro acesso" },
  { value: "comprovante_pagamento", label: "Comprovante de pagamento" },
  { value: "outros", label: "Outros" },
] as const;

export const TEMPLATE_VARIABLES = [
  "{nome_cliente}", "{nome_colaborador}", "{competencia}",
  "{data_vencimento}", "{nome_empresa}", "{tipo_documento}", "{tipo_guia}",
] as const;

export const TASK_PRIORITIES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export const DOC_TYPES = [
  { value: "extrato_bancario", label: "Extrato bancário" },
  { value: "comprovante", label: "Comprovante" },
  { value: "nota_fiscal", label: "Nota fiscal" },
  { value: "folha_pagamento", label: "Folha de pagamento" },
  { value: "contrato", label: "Contrato" },
  { value: "outro", label: "Outro" },
] as const;

export const DOC_STATUSES = [
  { value: "recebido", label: "Recebido" },
  { value: "em_analise", label: "Em análise" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recusado", label: "Recusado" },
] as const;

export const INTERACTION_TYPES = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "reuniao", label: "Reunião" },
  { value: "observacao", label: "Observação interna" },
  { value: "outro", label: "Outro" },
] as const;

export const CLIENT_TYPES = [
  { value: "comercio", label: "Comércio" },
  { value: "servicos", label: "Serviços" },
  { value: "industria", label: "Indústria" },
  { value: "holding", label: "Holding" },
  { value: "pessoa_fisica", label: "Pessoa física" },
  { value: "outro", label: "Outro" },
] as const;

export function labelOf<T extends { value: string; label: string }>(
  arr: readonly T[],
  v: string | null | undefined,
): string {
  if (!v) return "—";
  return arr.find((x) => x.value === v)?.label ?? v;
}

export const DOC_VALIDITY_CATEGORIES = [
  { value: "certificado_digital", label: "Certificado digital" },
  { value: "procuracao_eletronica", label: "Procuração eletrônica" },
  { value: "contrato_social", label: "Contrato social" },
  { value: "alvara", label: "Alvará" },
  { value: "inscricao_municipal", label: "Inscrição municipal" },
  { value: "inscricao_estadual", label: "Inscrição estadual" },
  { value: "certidao", label: "Certidão" },
  { value: "documento_socio", label: "Documento de sócio" },
  { value: "outro", label: "Outro" },
] as const;
