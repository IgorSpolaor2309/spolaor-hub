/**
 * Filtros de data padronizados (presets) para listagens do SC Central.
 * Trabalha com datas LOCAIS. Aceita valores no formato "YYYY-MM-DD"
 * (data pura) ou ISO completo (timestamps como created_at).
 */
import { todayLocalYmd } from "./dates";

export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last3"
  | "thisWeek"
  | "last15"
  | "thisMonth"
  | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "Qualquer data" },
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last3", label: "Últimos 3 dias" },
  { value: "thisWeek", label: "Esta semana" },
  { value: "last15", label: "Últimos 15 dias" },
  { value: "thisMonth", label: "Este mês" },
  { value: "custom", label: "Personalizado" },
];

export type DateRange = { from: string | null; to: string | null }; // YMD inclusive

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Resolve preset + custom para um range YMD inclusivo. */
export function resolveRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: ymd(y), to: ymd(y) };
    }
    case "last3":
      return { from: ymd(addDays(today, -2)), to: ymd(today) };
    case "last15":
      return { from: ymd(addDays(today, -14)), to: ymd(today) };
    case "thisWeek": {
      // semana começa na segunda
      const dow = today.getDay(); // 0=dom..6=sab
      const diff = dow === 0 ? -6 : 1 - dow;
      const start = addDays(today, diff);
      const end = addDays(start, 6);
      return { from: ymd(start), to: ymd(end) };
    }
    case "thisMonth": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: ymd(start), to: ymd(end) };
    }
    case "custom":
      return { from: customFrom || null, to: customTo || null };
  }
}

/** Converte qualquer string (YMD ou ISO) em YMD LOCAL. */
export function toLocalYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return ymd(d);
}

/** Verifica se um valor (YMD ou ISO) está dentro do range inclusivo. */
export function inRange(value: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const v = toLocalYmd(value);
  if (!v) return false;
  if (range.from && v < range.from) return false;
  if (range.to && v > range.to) return false;
  return true;
}

export { todayLocalYmd };
