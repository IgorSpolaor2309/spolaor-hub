/**
 * Helpers de exibição de empresa/cliente.
 *
 * Prioridade do rótulo (multiempresa-friendly):
 *   1) Nome Fantasia
 *   2) Razão Social / Nome
 *   3) CNPJ/CPF
 *   4) fallback "Empresa"
 */

export type ClientLike = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  documento?: string | null;
} | null | undefined;

export function clientLabel(c: ClientLike): string {
  if (!c) return "Empresa";
  const nf = (c.nome_fantasia ?? "").trim();
  const rs = (c.razao_social ?? "").trim();
  const doc = (c.documento ?? "").trim();
  return nf || rs || doc || "Empresa";
}

/** Linha secundária opcional (não duplica o que já está no label principal). */
export function clientSubLabel(c: ClientLike): string | null {
  if (!c) return null;
  const nf = (c.nome_fantasia ?? "").trim();
  const rs = (c.razao_social ?? "").trim();
  const doc = (c.documento ?? "").trim();
  if (nf && rs && nf !== rs) return rs;
  if (doc && doc !== (nf || rs)) return doc;
  return null;
}
