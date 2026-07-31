// FASE S2 — matriz administrativa plano × serviço.
// Regras puras de apresentação/validação. Nenhum preço ou serviço é hardcoded aqui.

export const TIPO_INCLUSAO = [
  { value: "incluido", label: "Incluído" },
  { value: "incluido_com_limite", label: "Incluído com limite" },
  { value: "cobrado_a_parte", label: "Cobrado à parte" },
  { value: "sob_orcamento", label: "Sob orçamento" },
  { value: "indisponivel", label: "Indisponível" },
] as const;

export const PERIODICIDADE_LIMITE = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
  { value: "unico", label: "Único" },
] as const;

export type TipoInclusao = (typeof TIPO_INCLUSAO)[number]["value"];

export const TIPO_INCLUSAO_VALUES: readonly string[] = TIPO_INCLUSAO.map((t) => t.value);
export const PERIODICIDADE_LIMITE_VALUES: readonly string[] = PERIODICIDADE_LIMITE.map((p) => p.value);

export type PlanServiceRule = {
  id: string;
  plan_id: string;
  service_id: string;
  tipo_inclusao: string;
  limite_quantidade: number | null;
  unidade_limite: string | null;
  periodicidade_limite: string | null;
  valor_especifico: number | null;
  valor_especifico_provisorio: boolean;
  observacoes: string | null;
  ordem: number;
  status: string;
};

export type PlanServiceDraft = {
  tipo_inclusao: string;
  limite_quantidade: number | null;
  unidade_limite?: string | null;
  periodicidade_limite?: string | null;
  valor_especifico?: number | null;
};

/** Situação da combinação plano × serviço. Ausência de regra = "não configurado". */
export type Situacao = "nao_configurado" | "ativo" | "inativo";

export function situacaoOf(rule: PlanServiceRule | null | undefined): Situacao {
  if (!rule) return "nao_configurado";
  return rule.status === "ativo" ? "ativo" : "inativo";
}

export const SITUACAO_LABEL: Record<Situacao, string> = {
  nao_configurado: "Não configurado",
  ativo: "Configurado",
  inativo: "Inativo",
};

/** Exige limite apenas quando o tipo de inclusão for "incluído com limite". */
export function requiresLimite(tipo: string): boolean {
  return tipo === "incluido_com_limite";
}

export function validateRule(draft: PlanServiceDraft): string[] {
  const errors: string[] = [];
  if (!TIPO_INCLUSAO_VALUES.includes(draft.tipo_inclusao)) {
    errors.push("Tipo de inclusão inválido");
  }
  if (requiresLimite(draft.tipo_inclusao)) {
    if (draft.limite_quantidade == null || !(draft.limite_quantidade > 0)) {
      errors.push("Informe a quantidade limite (maior que zero)");
    }
  }
  if (
    draft.periodicidade_limite != null &&
    draft.periodicidade_limite !== "" &&
    !PERIODICIDADE_LIMITE_VALUES.includes(draft.periodicidade_limite)
  ) {
    errors.push("Periodicidade do limite inválida");
  }
  if (draft.valor_especifico != null && draft.valor_especifico < 0) {
    errors.push("Valor específico não pode ser negativo");
  }
  return errors;
}

/**
 * Precedência de preço para leitura administrativa: valor específico do plano
 * quando existir; caso contrário o valor de referência do catálogo.
 */
export function effectivePrice(
  service: { valor_referencia: number | null; valor_provisorio: boolean; tipo_preco: string },
  rule: PlanServiceRule | null | undefined,
): { valor: number | null; origem: "plano" | "catalogo" | "sob_orcamento" | "indefinido"; provisorio: boolean } {
  if (rule?.tipo_inclusao === "sob_orcamento" || service.tipo_preco === "sob_orcamento") {
    if (rule?.valor_especifico == null) {
      return { valor: null, origem: "sob_orcamento", provisorio: false };
    }
  }
  if (rule && rule.valor_especifico != null) {
    return { valor: rule.valor_especifico, origem: "plano", provisorio: rule.valor_especifico_provisorio };
  }
  if (service.valor_referencia != null) {
    return { valor: service.valor_referencia, origem: "catalogo", provisorio: service.valor_provisorio };
  }
  return { valor: null, origem: "indefinido", provisorio: service.valor_provisorio };
}

export function limiteLabel(rule: PlanServiceRule | null | undefined): string {
  if (!rule || rule.limite_quantidade == null) return "—";
  const unidade = rule.unidade_limite ? ` ${rule.unidade_limite}` : "";
  const per = rule.periodicidade_limite
    ? ` / ${PERIODICIDADE_LIMITE.find((p) => p.value === rule.periodicidade_limite)?.label.toLowerCase()}`
    : "";
  return `${rule.limite_quantidade}${unidade}${per}`;
}

/** Payload normalizado antes de gravar: limpa campos irrelevantes ao tipo escolhido. */
export function normalizeDraft(draft: PlanServiceDraft & { observacoes?: string | null }) {
  const limite = requiresLimite(draft.tipo_inclusao) ? draft.limite_quantidade : null;
  return {
    tipo_inclusao: draft.tipo_inclusao,
    limite_quantidade: limite,
    unidade_limite: limite == null ? (draft.unidade_limite || null) : draft.unidade_limite || null,
    periodicidade_limite: draft.periodicidade_limite || null,
    valor_especifico: draft.valor_especifico ?? null,
    observacoes: draft.observacoes || null,
  };
}
