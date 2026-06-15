export type AppRole = "admin" | "collaborator" | "client";

export const TASK_STATUSES = [
  { value: "aberta", label: "Aberta" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_cliente", label: "Aguardando cliente" },
  { value: "concluida", label: "Concluída" },
  { value: "vencida", label: "Vencida" },
  { value: "cancelada", label: "Cancelada" },
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
