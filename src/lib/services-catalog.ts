// FASE S1 — constantes de apresentação do catálogo administrativo de serviços.
// Nenhum serviço, plano ou preço é hardcoded aqui: apenas rótulos de enumerações.

export const TIPO_PRECO_SERVICO = [
  { value: "fixo", label: "Valor fixo" },
  { value: "por_unidade", label: "Por unidade" },
  { value: "sob_orcamento", label: "Sob orçamento" },
] as const;

export const TIPO_COBRANCA = [
  { value: "fixo_por_servico", label: "Valor fixo por serviço" },
  { value: "referencia_por_servico", label: "Valor de referência por serviço" },
  { value: "por_unidade", label: "Por unidade" },
] as const;

export const TIPO_PRECO_PLANO = [
  { value: "fixo", label: "Valor fixo" },
  { value: "sob_orcamento", label: "Sob orçamento" },
] as const;

export const labelOf = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
) => list.find((i) => i.value === value)?.label ?? value ?? "—";

export const brl = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type ServiceRow = {
  id: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  departamento: string | null;
  tipo_preco: string;
  tipo_cobranca: string;
  unidade_cobranca: string | null;
  valor_referencia: number | null;
  valor_provisorio: boolean;
  status: string;
  ordem: number;
  observacoes_internas: string | null;
};
