import { createFileRoute, Link } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMemo, useState } from "react";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/sc-types";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pendencias")({
  component: TasksPage,
});

function TasksPage() {
  const { role } = useCurrentUser();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["all-tasks"],
    queryFn: async () => (await supabase.from("pending_tasks").select("*, clients(razao_social)").order("prazo", { ascending: true, nullsFirst: false })).data ?? [],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pending_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-tasks"] }); toast.success("Pendência excluída"); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha")),
  });

  const filtered = tasks.filter((t: any) => {
    if (status !== "all" && t.status !== status) return false;
    if (priority !== "all" && t.prioridade !== priority) return false;
    if (q && !`${t.titulo} ${t.clients?.razao_social ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="Pendências" description="Tudo o que precisa de atenção." />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              {TASK_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
         filtered.length === 0 ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nada por aqui" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b"><th className="py-2 pr-4">Pendência</th><th>Cliente</th><th>Prazo</th><th>Prioridade</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => (
                <tr key={t.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">{t.titulo}</td>
                  <td><Link to="/clientes/$id" params={{ id: t.client_id }} className="text-secondary hover:underline">{t.clients?.razao_social}</Link></td>
                  <td>{t.prazo ? formatBR(t.prazo) : "—"}</td>
                  <td><PriorityBadge value={t.prioridade} /></td>
                  <td><StatusBadge value={t.status} /></td>
                  <td className="text-right">{isAdmin && <DeleteButton onConfirm={() => remove.mutate(t.id)} iconOnly />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

