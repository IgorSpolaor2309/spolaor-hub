import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorityBadge } from "@/components/sc/StatusBadge";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { useState, useMemo } from "react";
import { KANBAN_COLUMNS, DEPARTMENTS, TASK_PRIORITIES, labelOf } from "@/lib/sc-types";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { AlertTriangle, GripVertical, Calendar, User, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBR, isPastEndOfDay } from "@/lib/dates";


export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
});

function KanbanPage() {
  const { role } = useCurrentUser();
  const qc = useQueryClient();
  const [dept, setDept] = useState<string>("all");
  const [resp, setResp] = useState<string>("all");
  const [client, setClient] = useState<string>("all");
  const [prio, setPrio] = useState<string>("all");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [q, setQ] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["kanban-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_tasks")
        .select("*, clients(razao_social), collaborators(nome)")
        .order("prazo", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["kanban-clients"],
    queryFn: async () => (await supabase.from("clients").select("id, razao_social").order("razao_social")).data ?? [],
  });
  const { data: collabs = [] } = useQuery({
    queryKey: ["kanban-collabs"],
    queryFn: async () => (await supabase.from("collaborators").select("id, nome").order("nome")).data ?? [],
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("pending_tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban-tasks"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pending_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban-tasks"] });
      toast.success("Pendência excluída");
    },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha")),
  });


  const filtered = useMemo(() => {
    
    return tasks.filter((t: any) => {
      if (dept !== "all" && t.departamento !== dept) return false;
      if (resp !== "all" && t.collaborator_id !== resp) return false;
      if (client !== "all" && t.client_id !== client) return false;
      if (prio !== "all" && t.prioridade !== prio) return false;
      const overdue = t.prazo && isPastEndOfDay(t.prazo) && t.status !== "concluida" && t.status !== "cancelada";
      if (onlyOverdue && !overdue) return false;
      if (q && !`${t.titulo} ${t.clients?.razao_social ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [tasks, dept, resp, client, prio, onlyOverdue, q]);

  if (role && role !== "admin" && role !== "collaborator") {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div>
      <PageHeader title="Kanban de pendências" description="Visualize e mova pendências por departamento e status." />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar título/cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
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
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos clientes</SelectItem>
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
        </div>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {KANBAN_COLUMNS.map((col) => {
            const items = filtered.filter((t: any) => t.status === col.value);
            return (
              <div
                key={col.value}
                className="flex min-h-[200px] flex-col rounded-lg border border-border bg-muted/30 p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingId) {
                    updateStatus.mutate({ id: draggingId, status: col.value });
                    setDraggingId(null);
                  }
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2">
                  {items.map((t: any) => {
                    
                    const overdue = t.prazo && isPastEndOfDay(t.prazo) && t.status !== "concluida" && t.status !== "cancelada";
                    return (
                      <article
                        key={t.id}
                        draggable
                        onDragStart={() => setDraggingId(t.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className={cn(
                          "group cursor-grab rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow",
                          draggingId === t.id && "opacity-50",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{t.titulo || "(sem título)"}</div>
                            <Link
                              to="/clientes/$id"
                              params={{ id: t.client_id }}
                              className="mt-0.5 flex items-center gap-1 truncate text-xs text-secondary hover:underline"
                            >
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{t.clients?.razao_social ?? "Cliente —"}</span>
                            </Link>
                            {t.descricao && (
                              <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{t.descricao}</div>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {t.departamento ? labelOf(DEPARTMENTS, t.departamento) : "Sem depto."}
                              </span>
                              <PriorityBadge value={t.prioridade ?? "media"} />
                              {overdue && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                  <AlertTriangle className="h-3 w-3" /> Vencida
                                </span>
                              )}
                            </div>
                            <div className="mt-2 grid gap-0.5 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1 truncate">
                                <User className="h-3 w-3 shrink-0" />
                                <span className="truncate">{t.collaborators?.nome ?? "Sem responsável"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 shrink-0" />
                                <span>{t.prazo ? `Prazo ${formatBR(t.prazo)}` : "Sem prazo"}</span>
                                {t.competencia && <span>· {t.competencia}</span>}
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Select value={t.status} onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v })}>
                                <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {KANBAN_COLUMNS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {role === "admin" && (
                                <DeleteButton onConfirm={() => remove.mutate(t.id)} iconOnly />
                              )}
                            </div>
                          </div>
                        </div>

                      </article>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                      Sem pendências
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
