import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import { prazoKind, PRAZO_STYLE } from "@/lib/processo-prazo";
import { toast } from "sonner";
import { Workflow, ArrowLeft, Check, RotateCcw, FilePlus2, Activity, UserRound, CalendarClock, CheckCircle2, PauseCircle, PlayCircle, XCircle, ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { ProcessDocumentsSection } from "@/components/sc/ProcessDocumentsSection";
import { useProfilesMap } from "@/hooks/use-profiles-map";



export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: ProcessDetail,
});

const STATUSES = [
  { value: "nao_iniciado", label: "Não iniciado", cls: "bg-zinc-200 text-zinc-700" },
  { value: "em_andamento", label: "Em andamento", cls: "bg-blue-100 text-blue-800" },
  { value: "aguardando_cliente", label: "Aguardando cliente", cls: "bg-amber-100 text-amber-800" },
  { value: "aguardando_orgao", label: "Aguardando órgão", cls: "bg-orange-100 text-orange-800" },
  { value: "concluido", label: "Concluído", cls: "bg-emerald-100 text-emerald-800" },
  { value: "cancelado", label: "Cancelado", cls: "bg-red-100 text-red-800" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));
const PRIORIDADES = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];
const STEP_STATUSES = [
  { value: "pendente", label: "Pendente", cls: "bg-zinc-100 text-zinc-700" },
  { value: "em_andamento", label: "Em andamento", cls: "bg-blue-100 text-blue-800" },
  { value: "concluida", label: "Concluída", cls: "bg-emerald-100 text-emerald-800" },
  { value: "cancelada", label: "Cancelada", cls: "bg-red-100 text-red-800" },
];
const STEP_STATUS_MAP = Object.fromEntries(STEP_STATUSES.map((s) => [s.value, s]));

const TIMELINE_TIPOS = new Set([
  "processo_aberto", "processo_status", "processo_responsavel", "processo_prazo",
  "processo_etapa_status", "processo_etapa_responsavel", "processo_etapa_prazo",
  "processo_documento_vinculado", "processo_etapa_documento_vinculado", "processo_documento_desvinculado",
  "processo_requisito_atendido", "processo_requisito_substituido", "processo_requisito_removido",
]);
const TIMELINE_ICON: Record<string, any> = {
  processo_aberto: FilePlus2,
  processo_status: Activity,
  processo_responsavel: UserRound,
  processo_prazo: CalendarClock,
  processo_etapa_status: CheckCircle2,
  processo_etapa_responsavel: UserRound,
  processo_etapa_prazo: CalendarClock,
  processo_documento_vinculado: Paperclip,
  processo_etapa_documento_vinculado: Paperclip,
  processo_documento_desvinculado: Paperclip,
  processo_requisito_atendido: CheckCircle2,
  processo_requisito_substituido: Paperclip,
  processo_requisito_removido: XCircle,
};
const STATUS_LABEL: Record<string, string> = {
  nao_iniciado: "não iniciado", em_andamento: "em andamento",
  aguardando_cliente: "aguardando cliente", aguardando_orgao: "aguardando órgão",
  concluido: "concluído", cancelado: "cancelado",
  pendente: "pendente", concluida: "concluída", cancelada: "cancelada",
};
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("pt-BR") : "—";
function friendlyTimeline(tipo: string, descricao: string, meta: any): string {
  const oldL = STATUS_LABEL[meta?.old] ?? meta?.old;
  const newL = STATUS_LABEL[meta?.new] ?? meta?.new;
  switch (tipo) {
    case "processo_aberto": return "Processo aberto.";
    case "processo_status":
      if (newL === "aguardando cliente" || newL === "aguardando órgão")
        return `Processo em espera (${newL})${meta?.motivo_espera ? `: ${meta.motivo_espera}` : ""}.`;
      if (newL === "em andamento" && (oldL === "aguardando cliente" || oldL === "aguardando órgão"))
        return "Processo retomado.";
      return `Status → ${newL ?? "—"}.`;
    case "processo_responsavel": return "Responsável do processo alterado.";
    case "processo_prazo": return `Prazo alterado (${fmtDate(meta?.old)} → ${fmtDate(meta?.new)}).`;
    case "processo_etapa_status": {
      const stepName = descricao?.match(/"([^"]+)"/)?.[1];
      const nm = stepName ? `"${stepName}"` : "etapa";
      if (newL === "concluída") return `Etapa ${nm} concluída.`;
      if (oldL === "concluída" && newL !== "concluída") return `Etapa ${nm} reaberta.`;
      if (newL === "em andamento") return `Etapa ${nm} iniciada.`;
      return `Etapa ${nm} → ${newL ?? "—"}.`;
    }
    case "processo_etapa_responsavel": return descricao ?? "Responsável de etapa alterado.";
    case "processo_etapa_prazo": return `${descricao} (${fmtDate(meta?.old)} → ${fmtDate(meta?.new)}).`;
    default: return descricao ?? tipo;
  }
}

function ProcessDetail() {
  const { id } = Route.useParams();
  const { role, userId, loading } = useCurrentUser();
  const qc = useQueryClient();
  const ready = !loading && (role === "admin" || role === "collaborator");

  const procQ = useQuery({
    queryKey: ["company-process", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_processes")
        .select(
          "id, client_id, process_type_id, responsavel_id, status, prioridade, progresso, total_etapas, etapas_concluidas, data_abertura, prazo_final, data_conclusao, motivo_espera, observacoes, is_demo, demo_batch_id, created_at, updated_at, clients(id, razao_social, nome_fantasia, documento), process_types(nome, categoria, cor)",
        )
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stepsQ = useQuery({
    queryKey: ["company-process-steps", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_process_steps")
        .select(
          "id, company_process_id, process_step_id, nome, descricao, ordem, departamento, obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual, responsavel_id, prazo, prazo_tipo, prazo_dias, status, data_inicio, data_conclusao, concluida_por, concluida_dentro_prazo, observacoes, nome_publico, descricao_publica, observacao_publica, created_at, updated_at",
        )
        .eq("company_process_id", id).order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const collabsQ = useQuery({
    queryKey: ["processes-collabs"],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators")
        .select("id, user_id, nome_completo").eq("status", "active").order("nome_completo");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.user_id);
    },
  });

  const historyQ = useQuery({
    queryKey: ["company-process-history", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("timeline_events")
        .select("id, tipo, descricao, metadata, created_at, actor_profile_id")
        .filter("metadata->>process_id", "eq", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Resolve todos os nomes de profiles (responsável principal + responsáveis
  // de etapas + concluída_por + autores da timeline) em UMA única consulta.
  const stepRows = stepsQ.data ?? [];
  const histRows = historyQ.data ?? [];
  const profileIds = [
    procQ.data?.responsavel_id ?? null,
    ...stepRows.flatMap((r: any) => [r.responsavel_id, r.concluida_por]),
    ...histRows.map((r: any) => r.actor_profile_id),
  ];
  const profilesMap = useProfilesMap(profileIds);
  const nameOf = (uid?: string | null) => (uid ? profilesMap.data?.[uid] ?? null : null);

  const proc = procQ.data
    ? { ...procQ.data, responsavel: procQ.data.responsavel_id ? { full_name: nameOf(procQ.data.responsavel_id) } : null }
    : null;
  const steps = stepRows.map((r: any) => ({
    ...r,
    responsavel: r.responsavel_id ? { full_name: nameOf(r.responsavel_id) } : null,
    concluida: r.concluida_por ? { full_name: nameOf(r.concluida_por) } : null,
  }));
  const history = histRows.map((r: any) => ({ ...r, actor_name: nameOf(r.actor_profile_id) }));



  // Sentinela para sinalizar conflito de concorrência (row-version por updated_at)
  const CONCURRENCY_CONFLICT = "__concurrency_conflict__";
  const conflictToast = () =>
    toast.error("Este processo foi alterado enquanto você editava. Os dados mais recentes foram recarregados.");

  const updateProc = useMutation({
    // Serializa gravações do detalhe deste processo (evita out-of-order).
    scope: { id: `processo:${id}` },
    mutationFn: async ({ patch, expectedVersion }: { patch: any; expectedVersion: string | null | undefined }) => {
      let q = (supabase as any).from("company_processes").update(patch).eq("id", id);
      if (expectedVersion) q = q.eq("updated_at", expectedVersion);
      const { data, error } = await q.select("updated_at").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(CONCURRENCY_CONFLICT);
      return data.updated_at as string;
    },
    onSuccess: (newVersion) => {
      // Aplica nova versão no cache sem esperar refetch, evitando falso conflito na próxima edição.
      qc.setQueryData(["company-process", id], (prev: any) => prev ? { ...prev, updated_at: newVersion } : prev);
      qc.invalidateQueries({ queryKey: ["company-process", id] });
      qc.invalidateQueries({ queryKey: ["company-processes"] });
      qc.invalidateQueries({ queryKey: ["company-process-history", id] });
      qc.invalidateQueries({ queryKey: ["processos-indicadores"] });
    },
    onError: (e: any) => {
      if (e?.message === CONCURRENCY_CONFLICT) {
        conflictToast();
        qc.invalidateQueries({ queryKey: ["company-process", id] });
        qc.invalidateQueries({ queryKey: ["company-process-history", id] });
        return;
      }
      toast.error(e.message ?? "Falha ao atualizar");
    },
  });

  const updateStep = useMutation({
    scope: { id: `processo:${id}` },
    mutationFn: async ({ stepId, patch, expectedVersion }: { stepId: string; patch: any; expectedVersion: string | null | undefined }) => {
      let q = (supabase as any).from("company_process_steps").update(patch).eq("id", stepId);
      if (expectedVersion) q = q.eq("updated_at", expectedVersion);
      const { data, error } = await q.select("id, updated_at").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(CONCURRENCY_CONFLICT);
      return { stepId: data.id as string, updated_at: data.updated_at as string };
    },
    onSuccess: ({ stepId, updated_at }) => {
      qc.setQueryData(["company-process-steps", id], (prev: any[] | undefined) =>
        prev ? prev.map((r) => (r.id === stepId ? { ...r, updated_at } : r)) : prev,
      );
      qc.invalidateQueries({ queryKey: ["company-process-steps", id] });
      qc.invalidateQueries({ queryKey: ["company-processes"] });
      qc.invalidateQueries({ queryKey: ["company-process-history", id] });
      qc.invalidateQueries({ queryKey: ["processos-indicadores"] });
    },
    onError: (e: any) => {
      if (e?.message === CONCURRENCY_CONFLICT) {
        conflictToast();
        qc.invalidateQueries({ queryKey: ["company-process-steps", id] });
        qc.invalidateQueries({ queryKey: ["company-process-history", id] });
        return;
      }
      toast.error(e.message ?? "Falha ao atualizar etapa");
    },
  });



  const removeProc = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("company_processes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Processo excluído"); window.history.back(); },
    onError: (e: any) => toast.error(e.message),
  });

  const { total, done, pct } = useMemo(() => {
    const t = steps.length;
    const d = steps.filter((s: any) => s.status === "concluida").length;
    return { total: t, done: d, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [steps]);


  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Acesso restrito" />;
  }
  if (procQ.isLoading) return <p className="text-sm text-muted-foreground">Carregando processo…</p>;
  if (!procQ.data) return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo não encontrado" />;

  const p = proc as any;
  const st = STATUS_MAP[p.status];
  const isAdmin = role === "admin";

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/processos" search={{}}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <PageHeader
        title={p.process_types?.nome ?? "Processo"}
        description={clientLabel(p.clients)}
        action={
          isAdmin && <DeleteButton onConfirm={() => removeProc.mutate()} label="Excluir processo" iconOnly={false} />
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4 md:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {st && <Badge className={st.cls}>{st.label}</Badge>}
            <Badge variant="outline">{p.prioridade}</Badge>
            <span className="text-xs text-muted-foreground">
              Aberto em {new Date(p.data_abertura).toLocaleDateString("pt-BR")}
            </span>
            {p.prazo_final && <span className="text-xs text-muted-foreground">· Prazo {new Date(p.prazo_final).toLocaleDateString("pt-BR")}</span>}
          </div>

          <div className="mb-4 flex items-center gap-2">
            <Progress value={pct} className="h-2" />
            <span className="w-16 text-right text-sm text-muted-foreground">{done}/{total} · {pct}%</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={p.status} onValueChange={(v) => {
                if ((v === "aguardando_cliente" || v === "aguardando_orgao") && !((p.motivo_espera ?? "").trim())) {
                  toast.error("Informe o motivo da espera antes de mudar o status.");
                  return;
                }
                updateProc.mutate({ patch: { status: v }, expectedVersion: p.updated_at });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridade</Label>
              <Select value={p.prioridade} onValueChange={(v) => updateProc.mutate({ patch: { prioridade: v }, expectedVersion: p.updated_at })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável</Label>
              <Select value={p.responsavel_id ?? "__none__"} onValueChange={(v) => updateProc.mutate({ patch: { responsavel_id: v === "__none__" ? null : v }, expectedVersion: p.updated_at })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {(collabsQ.data ?? []).map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo final</Label>
              {/* key={updated_at} força remount após conflito/atualização, restaurando o defaultValue com o valor do servidor. */}
              <Input key={`prazo:${p.updated_at}`} type="date" defaultValue={p.prazo_final ?? ""}
                onBlur={(e) => { const v = e.target.value || null; if (v !== p.prazo_final) updateProc.mutate({ patch: { prazo_final: v }, expectedVersion: p.updated_at }); }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">
                Motivo da espera
                {(p.status === "aguardando_cliente" || p.status === "aguardando_orgao") && <span className="text-red-600"> *</span>}
              </Label>
              <Input key={`motivo:${p.updated_at}`} defaultValue={p.motivo_espera ?? ""}
                placeholder="Obrigatório para status de espera (cliente/órgão)"
                onBlur={(e) => { if (e.target.value !== (p.motivo_espera ?? "")) updateProc.mutate({ patch: { motivo_espera: e.target.value || null }, expectedVersion: p.updated_at }); }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea key={`obs:${p.updated_at}`} rows={2} defaultValue={p.observacoes ?? ""}
                onBlur={(e) => { if (e.target.value !== (p.observacoes ?? "")) updateProc.mutate({ patch: { observacoes: e.target.value || null }, expectedVersion: p.updated_at }); }} />
            </div>

          </div>
        </Card>


        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Timeline</div>
          {historyQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
            : (history).filter((e: any) => TIMELINE_TIPOS.has(e.tipo)).length === 0
              ? <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>
              : (
                <ol className="relative space-y-3 border-l pl-4">
                  {(history)
                    .filter((e: any) => TIMELINE_TIPOS.has(e.tipo))
                    .slice(0, 30)
                    .map((e: any) => {
                      const meta = e.metadata ?? {};
                      const Icon = TIMELINE_ICON[e.tipo] ?? Activity;
                      return (
                        <li key={e.id} className="relative">
                          <span className="absolute -left-[11px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                            <Icon className="h-2.5 w-2.5" />
                          </span>
                          <div className="text-xs font-medium">{friendlyTimeline(e.tipo, e.descricao, meta)}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(e.created_at).toLocaleString("pt-BR")} · {e.actor_name ?? "sistema"}
                          </div>
                        </li>
                      );
                    })}
                </ol>
              )}
        </Card>
      </div>


      <Card className="mt-3 p-2">
        <div className="border-b px-2 py-2 text-sm font-medium">Etapas</div>
        {stepsQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : steps.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma etapa.</p>
          : (
            <ul className="divide-y">
              {steps.map((s: any) => {
                const ss = STEP_STATUS_MAP[s.status];
                const isDone = s.status === "concluida";
                const pk = prazoKind(s.prazo, { status: s.status, concluidaDentroPrazo: s.concluida_dentro_prazo });
                const pkBadge = pk === "sem_prazo" || pk === "no_prazo" ? null : PRAZO_STYLE[pk];
                return (
                  <li key={s.id} className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-8 text-xs text-muted-foreground">#{s.ordem}</span>
                      <span className={`font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>{s.nome}</span>
                      {ss && <Badge className={ss.cls}>{ss.label}</Badge>}
                      {pkBadge && <Badge className={pkBadge.cls}>{pkBadge.label}</Badge>}
                      {s.departamento && <Badge variant="outline">{s.departamento}</Badge>}
                      {s.obrigatoria && <Badge variant="secondary">Obrigatória</Badge>}
                      {s.exige_documento && <Badge className="bg-amber-100 text-amber-800">Exige doc.</Badge>}
                      {s.visivel_cliente && <Badge className="bg-blue-100 text-blue-800">Visível ao cliente</Badge>}
                      {s.responsavel?.full_name && <span className="text-xs text-muted-foreground">· {s.responsavel.full_name}</span>}
                      {s.prazo && <span className="text-xs text-muted-foreground">· prazo {new Date(s.prazo).toLocaleDateString("pt-BR")}</span>}
                      <div className="ml-auto flex items-center gap-1">

                        {!isDone ? (
                          <Button size="sm" variant="outline" disabled={!s.pode_concluir_manual}
                            onClick={() => updateStep.mutate({ stepId: s.id, patch: { status: "concluida", data_conclusao: new Date().toISOString(), concluida_por: userId } })}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Concluir
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost"
                            onClick={() => updateStep.mutate({ stepId: s.id, patch: { status: "pendente", data_conclusao: null, concluida_por: null } })}>
                            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <div>
                        <Label className="text-[10px] uppercase">Status</Label>
                        <Select value={s.status} onValueChange={(v) =>
                          updateStep.mutate({ stepId: s.id, patch: {
                            status: v,
                            data_conclusao: v === "concluida" ? new Date().toISOString() : null,
                            concluida_por: v === "concluida" ? userId : null,
                          } })
                        }>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STEP_STATUSES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase">Responsável</Label>
                        <Select value={s.responsavel_id ?? "__none__"} onValueChange={(v) =>
                          updateStep.mutate({ stepId: s.id, patch: { responsavel_id: v === "__none__" ? null : v } })
                        }>
                          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Nenhum —</SelectItem>
                            {(collabsQ.data ?? []).map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase">Prazo</Label>
                        <Input className="h-8" type="date" defaultValue={s.prazo ?? ""}
                          onBlur={(e) => { const v = e.target.value || null; if (v !== s.prazo) updateStep.mutate({ stepId: s.id, patch: { prazo: v } }); }} />
                      </div>
                      <div className="sm:col-span-4">
                        <Label className="text-[10px] uppercase">Observações</Label>
                        <Textarea rows={2} defaultValue={s.observacoes ?? ""}
                          onBlur={(e) => { if (e.target.value !== (s.observacoes ?? "")) updateStep.mutate({ stepId: s.id, patch: { observacoes: e.target.value || null } }); }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </Card>

      <ProcessDocumentsSection
        processId={id}
        clientId={p.client_id}
        steps={steps.map((s: any) => ({ id: s.id, ordem: s.ordem, nome: s.nome }))}
        canEdit={isAdmin || role === "collaborator"}
      />

      {isAdmin && (
        <Card className="mt-3 p-2">
          <div className="border-b px-2 py-2 text-sm font-medium">
            Histórico de alterações
            <span className="ml-2 text-xs font-normal text-muted-foreground">técnico · somente administradores</span>
          </div>
          {historyQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
            : (history).length === 0 ? <p className="p-3 text-sm text-muted-foreground">Sem eventos registrados.</p>
            : (
              <ul className="divide-y">
                {(history).map((h: any) => (
                  <AuditRow key={h.id} event={h} />
                ))}
              </ul>
            )}
        </Card>
      )}
    </div>
  );
}

function AuditRow({ event }: { event: any }) {
  const [open, setOpen] = useState(false);
  const meta = event.metadata ?? {};
  const hasOldNew = meta.old !== undefined || meta.new !== undefined;
  const entity = event.tipo?.startsWith("processo_etapa_") ? "company_process_steps"
    : event.tipo?.startsWith("processo_") ? "company_processes" : "—";
  return (
    <li className="text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-baseline gap-2 p-3 text-left hover:bg-muted/40">
        {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
        <Badge variant="outline" className="text-[10px]">{event.tipo}</Badge>
        <span className="font-medium">{event.descricao}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(event.created_at).toLocaleString("pt-BR")}
        </span>
      </button>
      {open && (
        <div className="grid gap-1 border-t bg-muted/20 px-3 py-2 text-xs sm:grid-cols-2">
          <div><span className="text-muted-foreground">Usuário:</span> {event.actor_name ?? "sistema"}</div>
          <div><span className="text-muted-foreground">Papel/Origem:</span> {meta.origem_ator ?? "—"}</div>
          <div><span className="text-muted-foreground">Entidade:</span> {entity}</div>
          <div><span className="text-muted-foreground">Ação:</span> {event.tipo}</div>
          {meta.step_id && <div><span className="text-muted-foreground">Etapa (id):</span> <code className="rounded bg-background px-1">{meta.step_id}</code></div>}
          {meta.process_id && <div><span className="text-muted-foreground">Processo (id):</span> <code className="rounded bg-background px-1">{meta.process_id}</code></div>}
          {hasOldNew && (
            <>
              <div><span className="text-muted-foreground">Valor anterior:</span> <code className="rounded bg-background px-1">{String(meta.old ?? "—")}</code></div>
              <div><span className="text-muted-foreground">Valor novo:</span> <code className="rounded bg-background px-1">{String(meta.new ?? "—")}</code></div>
            </>
          )}
          {meta.motivo_espera && <div className="sm:col-span-2"><span className="text-muted-foreground">Motivo:</span> {meta.motivo_espera}</div>}
        </div>
      )}
    </li>
  );
}
