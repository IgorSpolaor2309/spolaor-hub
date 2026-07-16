// Helpers para competência mensal (formato "AAAA-MM").
// Não faz IO; não cria registros no banco.

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function isValidCompetencia(s: string | undefined | null): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function currentCompetencia(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseCompetencia(comp: string): { year: number; month: number } {
  const [y, m] = comp.split("-").map(Number);
  return { year: y, month: m };
}

export function shiftCompetencia(comp: string, delta: number): string {
  const { year, month } = parseCompetencia(comp);
  const total = year * 12 + (month - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function formatCompetenciaLong(comp: string): string {
  if (!isValidCompetencia(comp)) return comp;
  const { year, month } = parseCompetencia(comp);
  return `${MESES[month - 1]}/${year}`;
}

export function formatCompetenciaShort(comp: string): string {
  if (!isValidCompetencia(comp)) return comp;
  const { year, month } = parseCompetencia(comp);
  return `${MES_ABREV[month - 1]}/${year}`;
}

// Primeiro e último dia (locais) da competência, formato YYYY-MM-DD.
export function competenciaBounds(comp: string): { start: string; endExclusive: string } {
  const { year, month } = parseCompetencia(comp);
  const next = shiftCompetencia(comp, 1);
  const { year: ny, month: nm } = parseCompetencia(next);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(month)}-01`,
    endExclusive: `${ny}-${pad(nm)}-01`,
  };
}
