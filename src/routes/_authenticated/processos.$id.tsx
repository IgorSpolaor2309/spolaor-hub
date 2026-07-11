import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
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
import { Workflow, ArrowLeft, Check, RotateCcw, FilePlus2, Activity, UserRound, CalendarClock, CheckCircle2, PauseCircle, PlayCircle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";



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
        .select("*, clients(id, razao_social, nome_fantasia, documento), process_types(nome, categoria, cor)")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      if (data?.responsavel_id) {
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", data.responsavel_id).maybeSingle();
        (data as any).responsavel = prof ?? null;
      }
      return data;
    },
  });

  const stepsQ = useQuery({
    queryKey: ["company-process-steps", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_process_steps")
        .select("*")
        .eq("company_process_id", id).order("ordem").order("created_at");
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.flatMap((r: any) => [r.responsavel_id, r.concluida_por]).filter(Boolean)));
      let profMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids as string[]);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p.full_name; });
      }
      return rows.map((r: any) => ({
        ...r,
        responsavel: r.responsavel_id ? { full_name: profMap[r.responsavel_id] ?? null } : null,
        concluida: r.concluida_por ? { full_name: profMap[r.concluida_por] ?? null } : null,
      }));
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
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.actor_profile_id).filter(Boolean)));
      let profMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids as string[]);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p.full_name; });
      }
      return rows.map((r: any) => ({ ...r, actor_name: r.actor_profile_id ? profMap[r.actor_profile_id] ?? null : null }));
    },
  });


  const updateProc = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase as any).from("company_processes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-process", id] });
      qc.invalidateQueries({ queryKey: ["company-processes"] });
      qc.invalidateQueries({ queryKey: ["company-process-history", id] });
      qc.invalidateQueries({ queryKey: ["processos-indicadores"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const updateStep = useMutation({
    mutationFn: async ({ stepId, patch }: { stepId: string; patch: any }) => {
      const { error } = await (supabase as any).from("company_process_steps").update(patch).eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-process-steps", id] });
      qc.invalidateQueries({ queryKey: ["company-processes"] });
      qc.invalidateQueries({ queryKey: ["company-process-history", id] });
      qc.invalidateQueries({ queryKey: ["processos-indicadores"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar etapa"),
  });


  const removeProc = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("company_processes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Processo excluído"); window.history.back(); },
    onError: (e: any) => toast.error(e.message),
  });

  const steps = stepsQ.data ?? [];
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

  const p = procQ.data as any;
  const st = STATUS_MAP[p.status];
  const isAdmin = role === "admin";

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/processos"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
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
                updateProc.mutate({ status: v });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridade</Label>
              <Select value={p.prioridade} onValueChange={(v) => updateProc.mutate({ prioridade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável</Label>
              <Select value={p.responsavel_id ?? "__none__"} onValueChange={(v) => updateProc.mutate({ responsavel_id: v === "__none__" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhum —</SelectItem>
                  {(collabsQ.data ?? []).map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prazo final</Label>
              <Input type="date" defaultValue={p.prazo_final ?? ""}
                onBlur={(e) => { const v = e.target.value || null; if (v !== p.prazo_final) updateProc.mutate({ prazo_final: v }); }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">
                Motivo da espera
                {(p.status === "aguardando_cliente" || p.status === "aguardando_orgao") && <span className="text-red-600"> *</span>}
              </Label>
              <Input defaultValue={p.motivo_espera ?? ""}
                placeholder="Obrigatório para status de espera (cliente/órgão)"
                onBlur={(e) => { if (e.target.value !== (p.motivo_espera ?? "")) updateProc.mutate({ motivo_espera: e.target.value || null }); }} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} defaultValue={p.observacoes ?? ""}
                onBlur={(e) => { if (e.target.value !== (p.observacoes ?? "")) updateProc.mutate({ observacoes: e.target.value || null }); }} />
            </div>
          </div>
        </Card>


        <Card className="p-4">
          <div className="mb-2 text-sm font-medium">Linha do tempo</div>
          {steps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma etapa.</p> : (
            <ol className="relative space-y-3 border-l pl-4">
              {steps.map((s: any) => {
                const ss = STEP_STATUS_MAP[s.status];
                return (
                  <li key={s.id} className="relative">
                    <span className={`absolute -left-[9px] top-1 h-3 w-3 rounded-full border ${s.status === "concluida" ? "bg-emerald-500 border-emerald-500" : s.status === "em_andamento" ? "bg-blue-500 border-blue-500" : "bg-background"}`} />
                    <div className="text-sm font-medium">{s.nome}</div>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {ss && <Badge className={`${ss.cls} text-[10px]`}>{ss.label}</Badge>}
                      {s.prazo && <span>· prazo {new Date(s.prazo).toLocaleDateString("pt-BR")}</span>}
                      {s.data_conclusao && <span>· concl. {new Date(s.data_conclusao).toLocaleDateString("pt-BR")}</span>}
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

      <Card className="mt-3 p-2">
        <div className="border-b px-2 py-2 text-sm font-medium">Histórico detalhado</div>
        {historyQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : (historyQ.data ?? []).length === 0 ? <p className="p-3 text-sm text-muted-foreground">Sem eventos registrados.</p>
          : (
            <ul className="divide-y">
              {(historyQ.data ?? []).map((h: any) => {
                const meta = h.metadata ?? {};
                const hasOldNew = meta.old !== undefined || meta.new !== undefined;
                return (
                  <li key={h.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge variant="outline" className="text-[10px]">{h.tipo}</Badge>
                      <span className="font-medium">{h.descricao}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Ator: {h.actor_name ?? "sistema"}</span>
                      {meta.origem_ator && <span>· Origem: {meta.origem_ator}</span>}
                      {hasOldNew && (
                        <span>
                          · De <code className="rounded bg-muted px-1">{String(meta.old ?? "—")}</code>
                          {" "}para <code className="rounded bg-muted px-1">{String(meta.new ?? "—")}</code>
                        </span>
                      )}
                      {meta.motivo_espera && <span>· Motivo: {meta.motivo_espera}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </div>
  );
}
