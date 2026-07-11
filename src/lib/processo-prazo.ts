// Classificação visual de prazos de etapas/processos.
export type PrazoKind = "vencido" | "hoje" | "em_breve" | "sem_prazo" | "no_prazo" | "concluido_no_prazo" | "concluido_atraso";

export function prazoKind(prazo?: string | null, opts?: { status?: string; dataConclusao?: string | null; concluidaDentroPrazo?: boolean | null }): PrazoKind {
  const s = opts?.status;
  if (s === "concluida" || s === "concluido") {
    if (opts?.concluidaDentroPrazo === true) return "concluido_no_prazo";
    if (opts?.concluidaDentroPrazo === false) return "concluido_atraso";
    return "no_prazo";
  }
  if (!prazo) return "sem_prazo";
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(prazo + "T00:00:00");
  const diff = Math.round((d.getTime() - hoje.getTime()) / 86_400_000);
  if (diff < 0) return "vencido";
  if (diff === 0) return "hoje";
  if (diff <= 3) return "em_breve";
  return "no_prazo";
}

export const PRAZO_STYLE: Record<PrazoKind, { label: string; cls: string }> = {
  vencido:            { label: "Vencida",             cls: "bg-red-100 text-red-800" },
  hoje:               { label: "Vence hoje",          cls: "bg-orange-100 text-orange-800" },
  em_breve:           { label: "Vence em breve",      cls: "bg-amber-100 text-amber-800" },
  no_prazo:           { label: "No prazo",            cls: "bg-emerald-50 text-emerald-700" },
  sem_prazo:          { label: "Sem prazo",           cls: "bg-zinc-100 text-zinc-600" },
  concluido_no_prazo: { label: "Concluída no prazo",  cls: "bg-emerald-100 text-emerald-800" },
  concluido_atraso:   { label: "Concluída com atraso",cls: "bg-yellow-100 text-yellow-800" },
};
