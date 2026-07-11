import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
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

function MeusProcessosPage() {
  const { userId, role, loading } = useCurrentUser();
  const ready = !loading && !!userId && (role === "admin" || role === "collaborator");
  const [search, setSearch] = useState("");
  const [fPrazo, setFPrazo] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("open");

  const stepsQ = useQuery({
    queryKey: ["meus-processos-steps", userId],
    enabled: ready,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_process_steps")
        .select("id, nome, status, prazo, concluida_dentro_prazo, data_conclusao, company_process_id, ordem, company_processes!inner(id, status, prioridade, client_id, process_type_id, clients(razao_social, nome_fantasia, documento), process_types(nome, cor))")
        .eq("responsavel_id", userId!)
        .order("prazo", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = stepsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      const cp = r.company_processes;
      if (!cp) return false;
      if (fStatus === "open" && (r.status === "concluida" || r.status === "cancelada")) return false;
      if (fStatus === "done" && r.status !== "concluida") return false;
      if (fPrazo !== "all") {
        const k = prazoKind(r.prazo, { status: r.status, concluidaDentroPrazo: r.concluida_dentro_prazo });
        if (k !== fPrazo) return false;
      }
      if (q) {
        const hay = `${cp.clients?.razao_social ?? ""} ${cp.clients?.nome_fantasia ?? ""} ${cp.process_types?.nome ?? ""} ${r.nome}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fStatus, fPrazo]);

  const kpis = useMemo(() => {
    const abertas = rows.filter((r: any) => r.status !== "concluida" && r.status !== "cancelada");
    return {
      abertas: abertas.length,
      vencidas: abertas.filter((r: any) => prazoKind(r.prazo) === "vencido").length,
      hoje: abertas.filter((r: any) => prazoKind(r.prazo) === "hoje").length,
      em_breve: abertas.filter((r: any) => prazoKind(r.prazo) === "em_breve").length,
      sem_prazo: abertas.filter((r: any) => !r.prazo).length,
      concluidas: rows.filter((r: any) => r.status === "concluida").length,
    };
  }, [rows]);

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
            <span>{filtered.length} etapa(s)</span>
            <button className="underline" onClick={() => { setSearch(""); setFStatus("open"); setFPrazo("all"); }}>
              <X className="mr-1 inline h-3 w-3" />limpar filtros
            </button>
          </div>
        )}
      </Card>

      <Card className="p-2">
        {stepsQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : filtered.length === 0 ? <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Nada para você" description="Nenhuma etapa corresponde aos filtros." />
          : (
            <ul className="divide-y">
              {filtered.map((r: any) => {
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
      </Card>
    </div>
  );
}
