/**
 * Substituição de variáveis em modelos de mensagem.
 * Variáveis suportadas:
 *   {nome_cliente} {nome_empresa} {nome_colaborador}
 *   {competencia} {data_vencimento} {tipo_documento} {tipo_guia}
 */
import { formatBR } from "@/lib/dates";

export type TemplateVars = Partial<{
  nome_cliente: string;
  nome_empresa: string;
  nome_colaborador: string;
  competencia: string;
  data_vencimento: string;
  tipo_documento: string;
  tipo_guia: string;
}>;

const KNOWN_KEYS = [
  "nome_cliente", "nome_empresa", "nome_colaborador",
  "competencia", "data_vencimento", "tipo_documento", "tipo_guia",
] as const;

export function applyTemplateVars(content: string, vars: TemplateVars): string {
  let out = content;
  for (const key of KNOWN_KEYS) {
    const raw = vars[key];
    if (raw == null || raw === "") continue;
    const value = key === "data_vencimento" ? formatBR(raw) : raw;
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

/** Variáveis ainda presentes ({xxx}) após substituição. */
export function pendingVars(content: string): string[] {
  const found = new Set<string>();
  for (const m of content.matchAll(/\{([a-z_]+)\}/g)) found.add(m[1]);
  return Array.from(found);
}
