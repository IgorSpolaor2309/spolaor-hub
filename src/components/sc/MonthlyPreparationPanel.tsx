import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { formatCompetenciaLong, shiftCompetencia, currentCompetencia } from "@/lib/competencia";
import { CalendarPlus, Sparkles, AlertTriangle, CheckCircle2, PlayCircle } from "lucide-react";

type PreviewRow = {
  client_id: string;
  razao_social: string;
  is_demo: boolean;
  situacao: "nova" | "ja_existe" | "inativa" | "sem_responsavel" | "pre_entrada" | "excluida";
  responsible_profile_id: string | null;
  responsible_name: string | null;
};

const SITUACAO_LABEL: Record<PreviewRow["situacao"], string> = {
  nova: "Será criada",
  ja_existe: "Já existe",
  sem_responsavel: "Será criada sem responsável",
  inativa: "Ignorada · empresa inativa",
  pre_entrada: "Ignorada · antes da data de entrada",
  excluida: "Ignorada · excluída",
};

const SITUACAO_TONE: Record<PreviewRow["situacao"], string> = {
  nova: "bg-emerald-100 text-emerald-800",
  ja_existe: "bg-slate-100 text-slate-700",
  sem_responsavel: "bg-amber-100 text-amber-800",
  inativa: "bg-zinc-100 text-zinc-700",
  pre_entrada: "bg-zinc-100 text-zinc-700",
  excluida: "bg-zinc-100 text-zinc-700",
};

/**
 * Painel administrativo (Fase 4): resumo do mês e preparação mensal.
 * Só é renderizado quando role === "admin".
 */
export function MonthlyPreparationPanel({
  competence,
  onChangeCompetence,
}: {
  competence: string;
  onChangeCompetence: (c: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [previewComp, setPreviewComp] = useState(competence);
  const [includeDemo, setIncludeDemo] = useState(false);

  // Preview
  const previewQ = useQuery({
    queryKey: ["comp-generation-preview", previewComp, includeDemo],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "admin_generate_monthly_competences_preview",
        { p_competence: previewComp, p_include_demo: includeDemo },
      );
      if (error) throw error;
      return (data ?? []) as PreviewRow[];
    },
  });

  const counts = useMemo(() => {
    const acc = { nova: 0, ja_existe: 0, sem_responsavel: 0, inativa: 0, pre_entrada: 0, excluida: 0 } as Record<PreviewRow["situacao"], number>;
    (previewQ.data ?? []).forEach((r) => { acc[r.situacao] = (acc[r.situacao] ?? 0) + 1; });
    return acc;
  }, [previewQ.data]);

  const willCreate = counts.nova + counts.sem_responsavel;

  const exec = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_generate_monthly_competences", {
        p_competence: previewComp,
        p_include_demo: includeDemo,
        p_source: "manual",
      });
      if (error) throw error;
      return data as { created: number; existed: number; skipped: number; missing_responsible: number; errors: unknown[] };
    },
    onSuccess: (res) => {
      toast.success(
        `Preparação concluída. Criadas: ${res.created} · Já existiam: ${res.existed} · Sem responsável: ${res.missing_responsible} · Ignoradas: ${res.skipped}`,
      );
      qc.invalidateQueries({ queryKey: ["competence-overview"] });
      qc.invalidateQueries({ queryKey: ["competences-persisted"] });
      qc.invalidateQueries({ queryKey: ["comp-generation-preview"] });
      onChangeCompetence(previewComp);
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error("Não foi possível preparar a competência. " + (err?.message ?? ""));
    },
  });

  // Resumo estático da competência atual (contagem por status oficial)
  const summaryQ = useQuery({
    queryKey: ["comp-admin-summary", competence],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_competences")
        .select("status, responsible_profile_id")
        .eq("competence", competence);
      if (error) throw error;
      const rows = (data ?? []) as { status: string; responsible_profile_id: string | null }[];
      const byStatus: Record<string, number> = {};
      let semResp = 0;
      rows.forEach((r) => {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        if (!r.responsible_profile_id) semResp += 1;
      });
      return { total: rows.length, byStatus, semResp };
    },
  });

  const nowMonth = currentCompetencia();
  const suggestions = [-1, 0, 1].map((n) => shiftCompetencia(nowMonth, n));

  return (
    <Card className="mb-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Preparação mensal (admin)
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Resumo de {formatCompetenciaLong(competence)}:{" "}
            <b>{summaryQ.data?.total ?? 0}</b> competências criadas ·{" "}
            <b>{summaryQ.data?.semResp ?? 0}</b> sem responsável ·{" "}
            {Object.entries(summaryQ.data?.byStatus ?? {}).map(([s, n]) => (
              <span key={s} className="mr-2">{s}: {n}</span>
            ))}
          </div>
        </div>
        <Button size="sm" onClick={() => { setPreviewComp(competence); setOpen(true); }}>
          <CalendarPlus className="mr-2 h-4 w-4" /> Preparar competência mensal
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preparar competência mensal</DialogTitle>
          </DialogHeader>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Competência</label>
            <select
              className="rounded-md border bg-background px-2 py-1 text-sm"
              value={previewComp}
              onChange={(e) => setPreviewComp(e.target.value)}
            >
              {[-3, -2, -1, 0, 1, 2, 3].map((n) => {
                const c = shiftCompetencia(nowMonth, n);
                return <option key={c} value={c}>{formatCompetenciaLong(c)}</option>;
              })}
            </select>
            <label className="ml-4 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={includeDemo} onChange={(e) => setIncludeDemo(e.target.checked)} />
              Incluir empresas demo
            </label>
          </div>

          <Alert className="mb-3">
            <AlertDescription className="text-xs">
              Somente empresas ativas, dentro da data de entrada e não excluídas são consideradas.
              A execução é idempotente: competências já existentes não são duplicadas.
            </AlertDescription>
          </Alert>

          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <SummaryPill label="Serão criadas" value={counts.nova} tone="bg-emerald-100 text-emerald-800" />
            <SummaryPill label="Sem responsável" value={counts.sem_responsavel} tone="bg-amber-100 text-amber-800" />
            <SummaryPill label="Já existem" value={counts.ja_existe} tone="bg-slate-100 text-slate-700" />
            <SummaryPill label="Ignoradas (inativas)" value={counts.inativa} tone="bg-zinc-100 text-zinc-700" />
            <SummaryPill label="Antes da entrada" value={counts.pre_entrada} tone="bg-zinc-100 text-zinc-700" />
            <SummaryPill label="Excluídas" value={counts.excluida} tone="bg-zinc-100 text-zinc-700" />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {previewQ.isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando prévia…</div>
            ) : (previewQ.data ?? []).length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhuma empresa a analisar.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40 text-xs">
                  <tr>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">Situação</th>
                    <th className="p-2 text-left">Responsável sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {(previewQ.data ?? []).map((r) => (
                    <tr key={r.client_id} className="border-t">
                      <td className="p-2">
                        {r.razao_social}
                        {r.is_demo && <Badge variant="outline" className="ml-2 text-[10px]">demo</Badge>}
                      </td>
                      <td className="p-2">
                        <Badge className={SITUACAO_TONE[r.situacao]}>{SITUACAO_LABEL[r.situacao]}</Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.responsible_name ?? (r.situacao === "sem_responsavel" ? "—" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={exec.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => exec.mutate()}
              disabled={exec.isPending || willCreate === 0}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              {exec.isPending ? "Executando…" : `Criar ${willCreate} competência(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SummaryPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-md px-2 py-1 ${tone}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
