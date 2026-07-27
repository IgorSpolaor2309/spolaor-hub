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
  const direct = arr.find((x) => x.value === v);
  if (direct) return direct.label;
  const n = normalizeSlug(v);
  return arr.find((x) => normalizeSlug(x.value) === n || normalizeSlug(x.label) === n)?.label ?? v;
}

/** Lower, strip accents, collapse non-alphanum to underscore. */
export function normalizeSlug(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Map any label/legacy value to a canonical DOC_TYPES slug; falls back to slugified input. */
export function normalizeDocTipo(s: string | null | undefined): string {
  const n = normalizeSlug(s);
  if (!n) return "outro";
  const aliases: Record<string, string> = {
    extrato_bancario: "extrato_bancario",
    extrato: "extrato_bancario",
    notas_fiscais: "nota_fiscal",
    nota_fiscal: "nota_fiscal",
    nota: "nota_fiscal",
    folha_de_pagamento: "folha_pagamento",
    folha_pagamento: "folha_pagamento",
    pro_labore: "comprovante",
    comprovante_de_pagamento: "comprovante",
    comprovante: "comprovante",
    contrato: "contrato",
    contratos: "contrato",
    outro: "outro",
    outros: "outro",
  };
  if (aliases[n]) return aliases[n];
  const known = DOC_TYPES.find((t) => t.value === n);
  return known ? known.value : n;
}

export const DOC_VALIDITY_CATEGORIES = [
  { value: "certificado digital", label: "Certificado digital" },
  { value: "procuração eletrônica", label: "Procuração eletrônica" },
  { value: "contrato social", label: "Contrato social" },
  { value: "alvará", label: "Alvará" },
  { value: "inscrição municipal", label: "Inscrição municipal" },
  { value: "inscrição estadual", label: "Inscrição estadual" },
  { value: "certidão", label: "Certidão" },
  { value: "documento de sócio", label: "Documento de sócio" },
  { value: "outro", label: "Outro" },
] as const;
