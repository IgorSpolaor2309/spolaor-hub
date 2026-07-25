import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import { prazoKind, PRAZO_STYLE } from "@/lib/processo-prazo";
import { Briefcase, Search, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/meus-processos")({
  component: MeusProcessosPage,
});

const STEP_STATUS: Record<string, { label: string; cls: string }> = {
  pendente:     { label: "Pendente",     cls: "bg-zinc-100 text-zinc-700" },
  em_andamento: { label: "Em andamento", cls: "bg-blue-100 text-blue-800" },
  concluida:    { label: "Concluída",    cls: "bg-emerald-100 text-emerald-800" },
  cancelada:    { label: "Cancelada",    cls: "bg-red-100 text-red-800" },
};

const PAGE_SIZE = 30;

function MeusProcessosPage() {
  const { userId, role, loading } = useCurrentUser();
  const ready = !loading && !!userId && (role === "admin" || role === "collaborator");
  const [search, setSearch] = useState("");
  const [fPrazo, setFPrazo] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("open");
  const [page, setPage] = useState<number>(1);

  useEffect(() => { setPage(1); }, [search, fStatus, fPrazo]);

  const stepsQ = useQuery({
    queryKey: ["meus-processos-steps", userId, { search, fStatus, fPrazo, page }],
    enabled: ready,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_my_process_steps_paginated", {
        _search: search.trim() || null,
        _status_group: fStatus,
        _prazo: fPrazo !== "all" ? fPrazo : null,
        _page: page,
        _page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return data as { rows: any[]; total: number };
    },
  });

  const rows = stepsQ.data?.rows ?? [];
  const totalRows = stepsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  // KPIs em cima do RPC de indicadores (não recarrega tudo).
  const kpisQ = useQuery({
    queryKey: ["meus-processos-kpis", userId],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async () => {
      // 6 chamadas rápidas com count exact, sem hidratar rows.
      const base = (supabase as any).from("company_process_steps").select("id", { count: "exact", head: true }).eq("responsavel_id", userId!);
      const today = new Date().toISOString().slice(0, 10);
      const [abertas, vencidas, hoje, em_breve, sem_prazo, concluidas] = await Promise.all([
        base.not("status", "in", "(concluida,cancelada)"),
        base.not("status", "in", "(concluida,cancelada)").lt("prazo", today),
        base.not("status", "in", "(concluida,cancelada)").eq("prazo", today),
        base.not("status", "in", "(concluida,cancelada)").gt("prazo", today).lte("prazo", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)),
        base.not("status", "in", "(concluida,cancelada)").is("prazo", null),
        (supabase as any).from("company_process_steps").select("id", { count: "exact", head: true }).eq("responsavel_id", userId!).eq("status", "concluida"),
      ]);
      return {
        abertas: abertas.count ?? 0,
        vencidas: vencidas.count ?? 0,
        hoje: hoje.count ?? 0,
        em_breve: em_breve.count ?? 0,
        sem_prazo: sem_prazo.count ?? 0,
        concluidas: concluidas.count ?? 0,
      };
    },
  });

  const kpis = kpisQ.data ?? { abertas: 0, vencidas: 0, hoje: 0, em_breve: 0, sem_prazo: 0, concluidas: 0 };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Acesso restrito" />;
  }

  const activeFilters = (search ? 1 : 0) + (fStatus !== "open" ? 1 : 0) + (fPrazo !== "all" ? 1 : 0);

  return (
    <div>
      <PageHeader title="Meus processos" description="Etapas de processos atribuídas a você." />

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "abertas", label: "Abertas", v: kpis.abertas, cls: "bg-blue-50" },
          { k: "vencidas", label: "Vencidas", v: kpis.vencidas, cls: "bg-red-50 text-red-800", filter: () => { setFStatus("open"); setFPrazo("vencido"); } },
          { k: "hoje", label: "Hoje", v: kpis.hoje, cls: "bg-orange-50 text-orange-800", filter: () => { setFStatus("open"); setFPrazo("hoje"); } },
          { k: "em_breve", label: "Em breve", v: kpis.em_breve, cls: "bg-amber-50 text-amber-800", filter: () => { setFStatus("open"); setFPrazo("em_breve"); } },
          { k: "sem_prazo", label: "Sem prazo", v: kpis.sem_prazo, cls: "bg-zinc-50", filter: () => { setFStatus("open"); setFPrazo("sem_prazo"); } },
          { k: "concluidas", label: "Concluídas", v: kpis.concluidas, cls: "bg-emerald-50 text-emerald-800", filter: () => { setFStatus("done"); setFPrazo("all"); } },
        ].map((k) => (
          <button key={k.k} onClick={k.filter} disabled={!k.filter}
            className={`${k.cls} rounded-md border p-2 text-left transition ${k.filter ? "hover:brightness-95" : ""}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-70">{k.label}</div>
            <div className="text-lg font-semibold">{k.v}</div>
          </button>
        ))}
      </div>

      <Card className="mb-3 p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por empresa, tipo, etapa…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Situação</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Abertas</SelectItem>
                <SelectItem value="done">Concluídas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prazo</Label>
            <Select value={fPrazo} onValueChange={setFPrazo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="vencido">Vencidas</SelectItem>
                <SelectItem value="hoje">Vence hoje</SelectItem>
                <SelectItem value="em_breve">Vence em breve</SelectItem>
                <SelectItem value="sem_prazo">Sem prazo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {activeFilters > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{totalRows} etapa(s)</span>
            <button className="underline" onClick={() => { setSearch(""); setFStatus("open"); setFPrazo("all"); }}>
              <X className="mr-1 inline h-3 w-3" />limpar filtros
            </button>
          </div>
        )}
      </Card>

      <Card className="p-2">
        {stepsQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : rows.length === 0 ? <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Nada para você" description="Nenhuma etapa corresponde aos filtros." />
          : (
            <ul className="divide-y">
              {rows.map((r: any) => {
                const cp = r.company_processes;
                const ss = STEP_STATUS[r.status];
                const pk = prazoKind(r.prazo, { status: r.status, concluidaDentroPrazo: r.concluida_dentro_prazo });
                const pkBadge = pk === "no_prazo" || pk === "sem_prazo" ? null : PRAZO_STYLE[pk];
                return (
                  <li key={r.id}>
                    <Link to="/processos/$id" params={{ id: cp.id }} className="block p-3 hover:bg-muted/40">
                      <div className="flex flex-wrap items-center gap-2">
                        {cp.process_types?.cor && <span className="h-3 w-3 rounded-full border" style={{ background: cp.process_types.cor }} />}
                        <span className="font-medium">{clientLabel(cp.clients)}</span>
                        <Badge variant="outline">{cp.process_types?.nome}</Badge>
                        <span className="text-sm">· {r.nome}</span>
                        {ss && <Badge className={ss.cls}>{ss.label}</Badge>}
                        {pkBadge && <Badge className={pkBadge.cls}>{pkBadge.label}</Badge>}
                        {r.prazo && <span className="ml-auto text-xs text-muted-foreground">prazo {new Date(r.prazo).toLocaleDateString("pt-BR")}</span>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        {totalRows > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t px-2 py-2 text-xs text-muted-foreground">
            <span>Página {page} de {totalPages} · {totalRows} etapa(s)</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || stepsQ.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || stepsQ.isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// Manter compatibilidade caso algo importe useMemo indiretamente
export const __UNUSED__ = useMemo;

