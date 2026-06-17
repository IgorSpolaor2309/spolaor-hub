import type { ReceitaData } from "@/components/sc/CnpjLookup";

export type ClientReceitaFields = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  data_abertura: string;
  cnae_principal_codigo: string;
  cnae_principal_descricao: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  porte: string;
  natureza_juridica: string;
  capital_social: string;
  simples_nacional: boolean | null;
  mei: boolean | null;
  qsa_json: any[];
  dados_receita_json: any;
};

function toBool(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (v == null) return null;
  const s = String(v).toLowerCase();
  if (["true", "sim", "s", "1"].includes(s)) return true;
  if (["false", "nao", "não", "n", "0"].includes(s)) return false;
  return null;
}

export function mapReceitaToForm(r: ReceitaData): ClientReceitaFields {
  return {
    cnpj: r.cnpj ?? "",
    razao_social: r.razao_social ?? "",
    nome_fantasia: r.nome_fantasia ?? "",
    situacao_cadastral: r.descricao_situacao_cadastral ?? "",
    data_abertura: r.data_inicio_atividade ?? "",
    cnae_principal_codigo: r.cnae_fiscal ?? "",
    cnae_principal_descricao: r.cnae_fiscal_descricao ?? "",
    cep: r.cep ?? "",
    logradouro: r.logradouro ?? "",
    numero: r.numero ?? "",
    complemento: r.complemento ?? "",
    bairro: r.bairro ?? "",
    cidade: r.municipio ?? "",
    uf: r.uf ?? "",
    porte: r.porte ?? "",
    natureza_juridica: r.natureza_juridica ?? "",
    capital_social: r.capital_social != null ? String(r.capital_social) : "",
    simples_nacional: toBool(r.simples),
    mei: toBool(r.mei),
    qsa_json: Array.isArray(r.qsa) ? r.qsa : [],
    dados_receita_json: r._raw ?? r,
  };
}
