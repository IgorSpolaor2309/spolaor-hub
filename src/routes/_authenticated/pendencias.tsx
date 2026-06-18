import { createFileRoute, Link } from "@tanstack/react-router";
import { formatBR, todayLocalYmd, localYmdInDays } from "@/lib/dates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useMemo, useState } from "react";
import { ClipboardList, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pendencias")({
  component: TasksPage,
  errorComponent: () => <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />,
});

type Tipo = "tarefa" | "solicitacao" | "guia" | "validade";

type Item = {
  key: string;
  tipo: Tipo;
  tipoLabel: string;
  titulo: string;
  empresa: string;
  clientId: string | null;
  prazo: string | null;
  prazoLabel: string;
  status: string;
  statusTone: string;
  prioridade: string | null;
  link: string;
  rawId: string;
};

const TIPO_TONE: Record<Tipo, string> = {
  tarefa: "bg-zinc-100 text-zinc-700",
  solicitacao: "bg-sky-100 text-sky-800",
  guia: "bg-orange-100 text-orange-800",
  validade: "bg-amber-100 text-amber-800",
};
const TIPO_LABEL: Record<Tipo, string> = {
  tarefa: "Tarefa interna",
  solicitacao: "Solicitação de documento",
  guia: "Guia/Imposto",
  validade: "Validade",
};

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  aguardando_analise: "Aguardando análise",
  recebido: "Recebido",
  recusado: "Recusado",
  reenviar: "Reenviar",
  cancelado: "Cancelado",
};

function statusTone(tipo: Tipo, status: string, prazo: string | null): string {
  const t = todayLocalYmd();
  if (prazo && prazo < t) return "bg-destructive/10 text-destructive";
  if (tipo === "guia") return "bg-orange-100 text-orange-800";
  if (tipo === "solicitacao") return "bg-sky-100 text-sky-800";
  if (tipo === "validade") return "bg-amber-100 text-amber-800";
  if (status === "aguardando_cliente") return "bg-amber-100 text-amber-800";
  return "bg-zinc-100 text-zinc-700";
}

function empresaLabel(c: any): string {
  return c?.nome_fantasia || c?.razao_social || c?.documento || "—";
}

function TasksPage() {
  const { role, userId, loading } = useCurrentUser();
  const isAdmin = role === "admin";
  const ready = !loading && !!userId && !!role;
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [empresa, setEmpresa] = useState<string>("all");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);

  const { data: combined, isLoading, error } = useQuery({
    queryKey: ["pendencias-consolidadas", userId, role],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const t = todayLocalYmd();
      const in30 = localYmdInDays(30);
      const [tasks, reqs, guides, docs] = await Promise.all([
        supabase
          .from("pending_tasks")
          .select("id, titulo, prazo, status, prioridade, client_id, clients(razao_social, nome_fantasia, documento)")
          .not("status", "in", "(concluida,cancelada)"),
        supabase
          .from("document_requests")
          .select("id, titulo, categoria, prazo, status, client_id, clients(razao_social, nome_fantasia, documento)")
          .in("status", role === "client" ? ["pendente", "reenviar"] : ["pendente", "reenviar", "aguardando_analise"]),
        supabase
          .from("tax_guides")
          .select("id, tipo, vencimento, status, comprovante_path, client_id, clients(razao_social, nome_fantasia, documento)")
          .not("status", "in", "(paga,cancelada)"),
        supabase
          .from("documents")
          .select("id, nome, data_validade, tipo, client_id, clients(razao_social, nome_fantasia, documento)")
          .not("data_validade", "is", null)
          .lte("data_validade", in30),
      ]);
      const failures = [tasks, reqs, guides, docs].filter((r) => r.error);
      if (failures.length) console.warn("[pendencias] consultas parciais falharam", failures.map((r) => r.error?.message));

      const items: Item[] = [];

      for (const r of (tasks.data ?? []) as any[]) {
        items.push({
          key: `tarefa:${r.id}`,
          tipo: "tarefa",
          tipoLabel: TIPO_LABEL.tarefa,
          titulo: r.titulo,
          empresa: empresaLabel(r.clients),
          clientId: r.client_id,
          prazo: r.prazo,
          prazoLabel: r.prazo ? formatBR(r.prazo) : "—",
          status: r.status ?? "—",
          statusTone: statusTone("tarefa", r.status, r.prazo),
          prioridade: r.prioridade ?? null,
          link: "/pendencias",
          rawId: r.id,
        });
      }

      for (const r of (reqs.data ?? []) as any[]) {
        items.push({
          key: `solicitacao:${r.id}`,
          tipo: "solicitacao",
          tipoLabel: TIPO_LABEL.solicitacao,
          titulo: r.titulo || r.categoria || "Documento solicitado",
          empresa: empresaLabel(r.clients),
          clientId: r.client_id,
          prazo: r.prazo,
          prazoLabel: r.prazo ? formatBR(r.prazo) : "—",
          status: r.status,
          statusTone: statusTone("solicitacao", r.status, r.prazo),
          prioridade: null,
          link: "/solicitacoes",
          rawId: r.id,
        });
      }

      for (const r of (guides.data ?? []) as any[]) {
        items.push({
          key: `guia:${r.id}`,
          tipo: "guia",
          tipoLabel: TIPO_LABEL.guia,
          titulo: r.tipo || "Guia/Imposto",
          empresa: empresaLabel(r.clients),
          clientId: r.client_id,
          prazo: r.vencimento,
          prazoLabel: r.vencimento ? formatBR(r.vencimento) : "—",
          status: r.status,
          statusTone: statusTone("guia", r.status, r.vencimento),
          prioridade: null,
          link: "/guias",
          rawId: r.id,
        });
      }

      for (const r of (docs.data ?? []) as any[]) {
        items.push({
          key: `validade:${r.id}`,
          tipo: "validade",
          tipoLabel: TIPO_LABEL.validade,
          titulo: r.nome,
          empresa: empresaLabel(r.clients),
          clientId: r.client_id,
          prazo: r.data_validade,
          prazoLabel: r.data_validade ? formatBR(r.data_validade) : "—",
          status: r.data_validade && r.data_validade < t ? "vencido" : "a vencer",
          statusTone: statusTone("validade", "", r.data_validade),
          prioridade: null,
          link: "/validades",
          rawId: r.id,
        });
      }

      items.sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0;
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return a.prazo.localeCompare(b.prazo);
      });
      return items;
    },
  });

  const items = combined ?? [];

  const empresas = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) {
      if (i.clientId) map.set(i.clientId, i.empresa);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const statusOptions = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.status) s.add(i.status);
    return [...s].sort();
  }, [items]);

  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = items.filter((i) => {
    if (tipo !== "all" && i.tipo !== tipo) return false;
    if (status !== "all" && i.status !== status) return false;
    if (empresa !== "all" && i.clientId !== empresa) return false;
    if (q && !`${i.titulo} ${i.empresa}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (!inRange(i.prazo, range)) return false;
    return true;
  });
  const clearFilters = () => {
    setQ(""); setTipo("all"); setStatus("all"); setEmpresa("all"); setDateF(EMPTY_DATE_FILTER);
  };

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pending_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pendencias-consolidadas"] }); toast.success("Pendência excluída"); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha")),
  });

  if (!ready) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div>
      <PageHeader title="Pendências" description="Visão consolidada: tarefas internas, documentos solicitados, guias e validades." />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="tarefa">Tarefa interna</SelectItem>
              <SelectItem value="solicitacao">Solicitação de documento</SelectItem>
              <SelectItem value="guia">Guia/Imposto</SelectItem>
              <SelectItem value="validade">Validade</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {empresas.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangeFilter value={dateF} onChange={setDateF} label="Prazo" />
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
        {error ? <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." /> :
         isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
         filtered.length === 0 ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nenhuma pendência encontrada." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="pr-4">Título</th>
                  <th className="pr-4">Empresa</th>
                  <th className="pr-4">Prazo</th>
                  <th className="pr-4">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.key} className="border-b align-top">
                    <td className="py-3 pr-4">
                      <Badge className={TIPO_TONE[i.tipo]}>{i.tipoLabel}</Badge>
                    </td>
                    <td className="pr-4 font-medium">{i.titulo}</td>
                    <td className="pr-4">
                      {i.clientId ? (
                        <Link to="/clientes/$id" params={{ id: i.clientId }} className="text-secondary hover:underline">
                          {i.empresa}
                        </Link>
                      ) : <span>{i.empresa}</span>}
                    </td>
                    <td className="pr-4">{i.prazoLabel}</td>
                    <td className="pr-4"><Badge className={i.statusTone}>{STATUS_LABEL[i.status] ?? i.status}</Badge></td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={i.link as any}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {isAdmin && i.tipo === "tarefa" && <DeleteButton onConfirm={() => removeTask.mutate(i.rawId)} iconOnly />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
