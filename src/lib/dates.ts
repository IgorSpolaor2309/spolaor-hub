/**
 * Utilitários de data centralizados para o SC Central.
 *
 * Regras:
 * - Datas em campos sem horário (prazo, vencimento, data_validade, competência, etc.)
 *   são armazenadas como string "YYYY-MM-DD" e devem ser tratadas como data LOCAL.
 *   Nunca use `new Date("YYYY-MM-DD")` direto — isso é interpretado como UTC e
 *   pode voltar um dia em fusos negativos (Brasil).
 * - Prazos e vencimentos só são considerados vencidos APÓS o final do dia local
 *   escolhido (23:59:59). No dia escolhido, ainda estão dentro do prazo.
 */

/** Extrai "YYYY-MM-DD" de uma string que pode vir como "YYYY-MM-DD" ou ISO completo. */
function asYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Data de hoje no fuso LOCAL no formato "YYYY-MM-DD". */
export function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" daqui a N dias, em horário LOCAL. */
export function localYmdInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Converte "YYYY-MM-DD" em Date local ao meio-dia (evita troca de dia por DST/UTC). */
export function parseLocalDate(value: string | null | undefined): Date | null {
  const ymd = asYmd(value);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/** Formata "YYYY-MM-DD" como dd/mm/yyyy (pt-BR), sem deslocamento de fuso. */
export function formatBR(value: string | null | undefined): string {
  const d = parseLocalDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Retorna true se a data "YYYY-MM-DD" já passou — ou seja, hoje é estritamente
 * posterior ao dia escolhido. No próprio dia o prazo ainda NÃO está vencido.
 */
export function isPastEndOfDay(value: string | null | undefined): boolean {
  const ymd = asYmd(value);
  if (!ymd) return false;
  return todayLocalYmd() > ymd;
}

/** Dias restantes até `value` (negativo se já passou), considerando data local. */
export function daysUntilLocal(value: string | null | undefined): number | null {
  const d = parseLocalDate(value);
  if (!d) return null;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}
