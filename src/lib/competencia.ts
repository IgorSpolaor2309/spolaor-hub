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

// Normaliza entradas variadas para a forma canônica "AAAA-MM".
// Aceita: "2026-07", "2026-7", "07/2026", "7/2026", "2026-07-01", "2026/07".
// Retorna null quando não for possível normalizar.
export function normalizeCompetencia(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number) =>
    y >= 1900 && y <= 2999 && m >= 1 && m <= 12 ? `${y}-${pad(m)}` : null;

  let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (m) return ok(Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return ok(Number(m[2]), Number(m[1]));
  return null;
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
