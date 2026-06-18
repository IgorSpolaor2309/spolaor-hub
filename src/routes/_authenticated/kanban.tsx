import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorityBadge } from "@/components/sc/StatusBadge";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { useState, useMemo } from "react";
import { KANBAN_COLUMNS, DEPARTMENTS, TASK_PRIORITIES, labelOf } from "@/lib/sc-types";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { AlertTriangle, GripVertical, Calendar, User, Building2, FileText, Inbox, Receipt, ClipboardList, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBR, isPastEndOfDay } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
});

type ItemKind = "tarefa" | "solicitacao" | "documento" | "guia" | "comprovante";
type ColKey = "aberta" | "aguardando_cliente" | "em_andamento" | "em_revisao" | "concluida";

type UnifiedItem = {
  id: string;            // unique key (kind:realId)
  realId: string;
  kind: ItemKind;
  column: ColKey;
  titulo: string;
  descricao?: string | null;
  status: string;
  client_id: string;
  client_name?: string | null;
  collaborator_id?: string | null;
  collaborator_name?: string | null;
  departamento?: string | null;
  prioridade?: string | null;
  prazo?: string | null;
  competencia?: string | null;
  categoria?: string | null;
  overdue: boolean;
  href: string;
};

const KIND_META: Record<ItemKind, { label: string; tone: string; icon: typeof FileText }> = {
  tarefa: { label: "Pendência", tone: "bg-primary/10 text-primary", icon: ClipboardList },
  solicitacao: { label: "Solicitação", tone: "bg-sky-100 text-sky-800", icon: Inbox },
  documento: { label: "Documento", tone: "bg-blue-100 text-blue-800", icon: FileText },
  guia: { label: "Guia", tone: "bg-amber-100 text-amber-800", icon: Receipt },
  comprovante: { label: "Comprovante", tone: "bg-emerald-100 text-emerald-800", icon: Receipt },
};

const KIND_OPTIONS: { value: ItemKind | "all"; label: string }[] = [
  { value: "all", label: "Todos os tipos" },
  { value: "tarefa", label: "Pendências" },
  { value: "solicitacao", label: "Solicitações" },
  { value: "documento", label: "Documentos" },
  { value: "guia", label: "Guias" },
  { value: "comprovante", label: "Comprovantes" },
];

function KanbanPage() {
  const { role, userId, loading } = useCurrentUser();
  const ready = !loading && !!userId && !!role;
  const qc = useQueryClient();
  const [dept, setDept] = useState<string>("all");
  const [resp, setResp] = useState<string>("all");
  const [client, setClient] = useState<string>("all");
  const [prio, setPrio] = useState<string>("all");
  const [kind, setKind] = useState<ItemKind | "all">("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: items = [], isLoading, error: itemsError } = useQuery({
    queryKey: ["kanban-unified", userId, role],
    enabled: ready && (role === "admin" || role === "collaborator"),
    retry: 1,
    queryFn: async (): Promise<UnifiedItem[]> => {
      const [tasksRes, reqsRes, docsRes, guidesRes] = await Promise.all([
        supabase.from("pending_tasks").select("*, clients(razao_social, nome_fantasia), collaborators(nome)"),
        supabase.from("document_requests").select("id, client_id, titulo, categoria, status, prazo, competencia, responsavel_profile_id, document_id, clients(razao_social, nome_fantasia)"),
        supabase.from("documents").select("id, client_id, nome, status, created_at, clients(razao_social, nome_fantasia)").in("status", ["recebido", "em_analise", "aprovado"]),
        supabase.from("tax_guides").select("id, client_id, tipo, status, vencimento, competencia, comprovante_path, comprovante_uploaded_at, clients(razao_social, nome_fantasia)"),
      ]);
      const out: UnifiedItem[] = [];
      const failures = [tasksRes, reqsRes, docsRes, guidesRes].filter((r) => r.error);
      if (failures.length) console.warn("[kanban] consultas parciais falharam", failures.map((r) => r.error?.message));

      for (const t of (tasksRes.data ?? []) as any[]) {
        const col: ColKey = (KANBAN_COLUMNS.find((c) => c.value === t.status)?.value as ColKey) ?? "aberta";
        out.push({
          id: `tarefa:${t.id}`, realId: t.id, kind: "tarefa", column: col,
          titulo: t.titulo, descricao: t.descricao, status: t.status,
          client_id: t.client_id, client_name: t.clients?.nome_fantasia || t.clients?.razao_social,
          collaborator_id: t.collaborator_id, collaborator_name: t.collaborators?.nome,
          departamento: t.departamento, prioridade: t.prioridade,
          prazo: t.prazo, competencia: t.competencia, categoria: null,
          overdue: !!t.prazo && isPastEndOfDay(t.prazo) && !["concluida","cancelada"].includes(t.status),
          href: "/pendencias",
        });
      }

      for (const r of (reqsRes.data ?? []) as any[]) {
        if (["recusado","cancelado"].includes(r.status)) continue;
        let col: ColKey;
        if (r.status === "pendente" || r.status === "reenviar") col = "aguardando_cliente";
        else if (r.status === "recebido") col = "em_revisao";
        else if (r.status === "aprovado") col = "concluida";
        else col = "aguardando_cliente";
        out.push({
          id: `solicitacao:${r.id}`, realId: r.id, kind: "solicitacao", column: col,
          titulo: r.titulo || r.categoria || "Documento solicitado",
          descricao: null, status: r.status,
          client_id: r.client_id, client_name: r.clients?.nome_fantasia || r.clients?.razao_social,
          collaborator_id: r.responsavel_profile_id, collaborator_name: null,
          departamento: null, prioridade: null,
          prazo: r.prazo, competencia: r.competencia, categoria: r.categoria,
          overdue: !!r.prazo && isPastEndOfDay(r.prazo) && !["aprovado","cancelado"].includes(r.status),
          href: "/solicitacoes",
        });
      }

      for (const d of (docsRes.data ?? []) as any[]) {
        let col: ColKey;
        if (d.status === "recebido") col = "em_andamento";
        else if (d.status === "em_analise") col = "em_revisao";
        else if (d.status === "aprovado") col = "concluida";
        else continue;
        out.push({
          id: `documento:${d.id}`, realId: d.id, kind: "documento", column: col,
          titulo: d.nome || "Documento", descricao: null, status: d.status,
          client_id: d.client_id, client_name: d.clients?.nome_fantasia || d.clients?.razao_social,
          departamento: null, prioridade: null,
          prazo: null, competencia: null, categoria: null,
          overdue: false, href: "/documentos",
        });
      }

      for (const g of (guidesRes.data ?? []) as any[]) {
        if (g.status === "cancelada") continue;
        const hasProof = !!g.comprovante_path;
        let kindG: ItemKind = "guia";
        let col: ColKey;
        if (g.status === "paga") col = "concluida";
        else if (hasProof) { kindG = "comprovante"; col = "em_andamento"; }
        else col = "aguardando_cliente";
        out.push({
          id: `${kindG}:${g.id}`, realId: g.id, kind: kindG, column: col,
          titulo: g.tipo || "Guia", descricao: null, status: g.status,
          client_id: g.client_id, client_name: g.clients?.nome_fantasia || g.clients?.razao_social,
          departamento: null, prioridade: null,
          prazo: g.vencimento, competencia: g.competencia, categoria: null,
          overdue: !!g.vencimento && isPastEndOfDay(g.vencimento) && !["paga","cancelada"].includes(g.status),
          href: "/guias",
        });
      }
      return out;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["kanban-clients", userId, role],
    enabled: ready && (role === "admin" || role === "collaborator"),
    queryFn: async () => (await supabase.from("clients").select("id, razao_social").is("deleted_at", null).neq("status", "inactive").order("razao_social")).data ?? [],
  });
  const { data: collabs = [] } = useQuery({
    queryKey: ["kanban-collabs"],
    enabled: ready && (role === "admin" || role === "collaborator"),
    queryFn: async () => (await supabase.from("collaborators").select("id, nome").order("nome")).data ?? [],
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("pending_tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban-unified"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pending_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban-unified"] });
      toast.success("Pendência excluída");
    },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha")),
  });

  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (kind !== "all" && t.kind !== kind) return false;
      if (dept !== "all" && t.departamento !== dept) return false;
      if (resp !== "all" && t.collaborator_id !== resp) return false;
      if (client !== "all" && t.client_id !== client) return false;
      if (prio !== "all" && t.prioridade !== prio) return false;
      if (onlyOverdue && !t.overdue) return false;
      if (q && !`${t.titulo} ${t.client_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (!inRange(t.prazo, range)) return false;
      return true;
    });
  }, [items, kind, dept, resp, client, prio, onlyOverdue, q, range]);

  const clearFilters = () => {
    setKind("all"); setDept("all"); setResp("all"); setClient("all"); setPrio("all");
    setOnlyOverdue(false); setQ(""); setDateF(EMPTY_DATE_FILTER);
  };

  if (!ready) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role && role !== "admin" && role !== "collaborator") {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div>
      <PageHeader title="Kanban operacional" description="Visão unificada de pendências, solicitações, documentos e guias." />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar título/cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={kind} onValueChange={(v) => setKind(v as any)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Departamento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos departamentos</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resp} onValueChange={setResp}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos responsáveis</SelectItem>
              {collabs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={client} onValueChange={setClient}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas empresas</SelectItem>
              {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={prio} onValueChange={setPrio}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {TASK_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={onlyOverdue} onCheckedChange={(v) => setOnlyOverdue(!!v)} />
            Apenas vencidas
          </label>
          <DateRangeFilter value={dateF} onChange={setDateF} label="Prazo" />
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
      </Card>

      {itemsError ? (
        <Card className="p-5"><p className="text-sm text-muted-foreground">Não foi possível carregar os dados. Tente novamente.</p></Card>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {KANBAN_COLUMNS.map((col) => {
            const colItems = filtered.filter((t) => t.column === col.value);
            return (
              <div
                key={col.value}
                className="flex min-h-[200px] flex-col rounded-lg border border-border bg-muted/30 p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingId) {
                    // Apenas tarefas têm status livre via DnD.
                    if (draggingId.startsWith("tarefa:")) {
                      const realId = draggingId.split(":")[1];
                      updateTaskStatus.mutate({ id: realId, status: col.value });
                    } else {
                      toast.info("Só pendências podem ser movidas no Kanban. Altere o status na tela do item.");
                    }
                    setDraggingId(null);
                  }
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{colItems.length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {colItems.map((t) => {
                    const meta = KIND_META[t.kind];
                    const KindIcon = meta.icon;
                    const draggable = t.kind === "tarefa";
                    return (
                      <article
                        key={t.id}
                        draggable={draggable}
                        onDragStart={() => draggable && setDraggingId(t.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className={cn(
                          "group rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow",
                          draggable && "cursor-grab",
                          draggingId === t.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {draggable ? (
                            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <KindIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", meta.tone)}>{meta.label}</span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.status}</span>
                            </div>
                            <div className="mt-1 truncate text-sm font-medium text-foreground">{t.titulo || "(sem título)"}</div>
                            {t.client_id && (
                              <Link
                                to="/clientes/$id"
                                params={{ id: t.client_id }}
                                className="mt-0.5 flex items-center gap-1 truncate text-xs text-secondary hover:underline"
                              >
                                <Building2 className="h-3 w-3 shrink-0" />
                                <span className="truncate">{t.client_name ?? "Cliente —"}</span>
                              </Link>
                            )}
                            {t.descricao && (
                              <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{t.descricao}</div>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {t.departamento && (
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  {labelOf(DEPARTMENTS, t.departamento)}
                                </span>
                              )}
                              {t.prioridade && <PriorityBadge value={t.prioridade} />}
                              {t.categoria && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.categoria}</span>
                              )}
                              {t.overdue && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                  <AlertTriangle className="h-3 w-3" /> Vencido
                                </span>
                              )}
                            </div>
                            <div className="mt-2 grid gap-0.5 text-[11px] text-muted-foreground">
                              {(t.collaborator_name || t.kind === "tarefa") && (
                                <div className="flex items-center gap-1 truncate">
                                  <User className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{t.collaborator_name ?? "Sem responsável"}</span>
                                </div>
                              )}
                              {(t.prazo || t.competencia) && (
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  <span>{t.prazo ? `Prazo ${formatBR(t.prazo)}` : "Sem prazo"}</span>
                                  {t.competencia && <span>· {t.competencia}</span>}
                                </div>
                              )}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              {t.kind === "tarefa" ? (
                                <Select value={t.status} onValueChange={(v) => updateTaskStatus.mutate({ id: t.realId, status: v })}>
                                  <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {KANBAN_COLUMNS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Link to={t.href as any} className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded border border-border bg-card px-2 text-xs text-foreground transition hover:bg-muted">
                                  <ExternalLink className="h-3 w-3" /> Abrir
                                </Link>
                              )}
                              {role === "admin" && t.kind === "tarefa" && (
                                <DeleteButton onConfirm={() => removeTask.mutate(t.realId)} iconOnly />
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {colItems.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                      Sem itens
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
