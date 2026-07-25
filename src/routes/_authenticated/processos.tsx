import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/sc/EmptyState";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import { PROCESS_STATUS_OPTIONS, PROCESS_PRIORITY_OPTIONS } from "@/lib/processos-constants";
import { ProcessListItem } from "@/components/sc/ProcessListItem";
import { toast } from "sonner";
import { Workflow, Plus, Search, X } from "lucide-react";


export const Route = createFileRoute("/_authenticated/processos")({
  component: ProcessesPage,
  validateSearch: (search: Record<string, unknown>) => ({
    client: typeof search.client === "string" ? search.client : undefined,
  }),
});

type TabKey = "todos" | "meus" | "aguardando" | "atrasados" | "concluidos";

const PAGE_SIZE = 30;

function ProcessesPage() {
  const { role, userId, loading } = useCurrentUser();
  const qc = useQueryClient();
  const routeSearch = Route.useSearch();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fClient, setFClient] = useState<string>(routeSearch.client ?? "all");
  const [fType, setFType] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPrio, setFPrio] = useState<string>("all");

  const [fResp, setFResp] = useState<string>("all");
  const [fPrazo, setFPrazo] = useState<string>("all"); // all | vencido | hoje | em_breve | sem_prazo
  const [sortBy, setSortBy] = useState<string>("prazo");
  const [tab, setTab] = useState<TabKey>(role === "collaborator" ? "meus" : "todos");
  const [page, setPage] = useState<number>(1);

  const ready = !loading && (role === "admin" || role === "collaborator");

  // Reset página quando filtros/aba/ordem mudam.
  useEffect(() => { setPage(1); }, [search, fClient, fType, fStatus, fPrio, fResp, fPrazo, sortBy, tab]);

  const listQ = useQuery({
    queryKey: ["company-processes", { search, fClient, fType, fStatus, fPrio, fResp, fPrazo, sortBy, tab, page }],
    enabled: ready,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_company_processes_paginated", {
        _search: search.trim() || null,
        _client_id: fClient !== "all" ? fClient : null,
        _process_type_id: fType !== "all" ? fType : null,
        _status: fStatus !== "all" ? fStatus : null,
        _prioridade: fPrio !== "all" ? fPrio : null,
        _responsavel_id: fResp !== "all" ? fResp : null,
        _prazo: fPrazo !== "all" ? fPrazo : null,
        _tab: tab,
        _sort_by: sortBy,
        _include_demo: true,
        _only_demo: false,
        _page: page,
        _page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return data as { rows: any[]; total: number; page: number; page_size: number };
    },
  });


  const typesQ = useQuery({
    queryKey: ["process-types-active"],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("process_types")
        .select("id, nome, categoria, cor, status").eq("status", "ativo").order("ordem").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientsQ = useQuery({
    queryKey: ["processes-clients"],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .is("deleted_at", null).order("razao_social");
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

  const indicQ = useQuery({
    queryKey: ["processos-indicadores"],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("processos_indicadores");
      if (error) throw error;
      return data as any;
    },
  });


  // Sincroniza a aba padrão quando o papel do usuário fica disponível.
  useEffect(() => {
    if (role === "collaborator") setTab((t) => (t === "todos" ? "meus" : t));
  }, [role]);

  const rows = listQ.data?.rows ?? [];
  const totalRows = listQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const kpis = useMemo(() => {
    // Indicadores globais usam RPC própria (processos_indicadores).
    const d = indicQ.data?.totais ?? {};
    return {
      total: d.total ?? 0,
      abertos: d.abertos ?? 0,
      em_andamento: d.em_andamento ?? 0,
      aguardando: d.aguardando ?? 0,
      vencidos: d.vencidos ?? 0,
      hoje: d.hoje ?? 0,
      em_breve: d.em_breve ?? 0,
      concluidos: d.concluidos ?? 0,
    };
  }, [indicQ.data]);

  const activeFilters = [fClient, fType, fStatus, fPrio, fResp, fPrazo].filter((v) => v !== "all").length + (search ? 1 : 0);
  const clearFilters = () => {
    setSearch(""); setFClient("all"); setFType("all"); setFStatus("all");
    setFPrio("all"); setFResp("all"); setFPrazo("all");
  };




  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores." />;
  }

  return (
    <div>
      <PageHeader
        title="Processos"
        description="Acompanhamento de serviços extraordinários das empresas."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo processo</Button>
            </DialogTrigger>
            {open && <NewProcessDialog
              clients={clientsQ.data ?? []}
              types={typesQ.data ?? []}
              collabs={collabsQ.data ?? []}
              onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["company-processes"] }); }}
            />}
          </Dialog>
        }
      />

      {/* Abas de visão (unifica "Meus processos" na página principal) */}
      <div className="mb-3 flex flex-wrap gap-1 border-b">
        {([
          { k: "todos", label: "Todos" },
          { k: "meus", label: "Meus processos" },
          { k: "aguardando", label: "Aguardando cliente" },
          { k: "atrasados", label: "Atrasados" },
          { k: "concluidos", label: "Concluídos" },
        ] as { k: TabKey; label: string }[]).map((t) => {
          const active = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Indicadores rápidos */}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {[
          { k: "total", label: "Total", v: kpis.total, cls: "bg-muted" },
          { k: "abertos", label: "Abertos", v: kpis.abertos, cls: "bg-blue-50" },
          { k: "em_andamento", label: "Em andamento", v: kpis.em_andamento, cls: "bg-blue-100", filter: () => setFStatus("em_andamento") },
          { k: "aguardando", label: "Aguardando", v: kpis.aguardando, cls: "bg-amber-50" },
          { k: "vencidos", label: "Vencidos", v: kpis.vencidos, cls: "bg-red-50 text-red-800", filter: () => setFPrazo("vencido") },
          { k: "hoje", label: "Hoje", v: kpis.hoje, cls: "bg-orange-50 text-orange-800", filter: () => setFPrazo("hoje") },
          { k: "em_breve", label: "Em breve", v: kpis.em_breve, cls: "bg-amber-50 text-amber-800", filter: () => setFPrazo("em_breve") },
          { k: "concluidos", label: "Concluídos", v: kpis.concluidos, cls: "bg-emerald-50 text-emerald-800", filter: () => setFStatus("concluido") },
        ].map((k) => (
          <button key={k.k} onClick={k.filter} disabled={!k.filter}
            className={`${k.cls} rounded-md border p-2 text-left transition ${k.filter ? "hover:brightness-95" : ""}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-70">{k.label}</div>
            <div className="text-lg font-semibold">{k.v}</div>
          </button>
        ))}
      </div>

      {/* Indicadores agregados (RPC) */}
      {indicQ.data && (
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <Card className="p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Desempenho</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Tempo médio</div>
                <div className="text-lg font-semibold">
                  {indicQ.data.totais?.tempo_medio_dias ? `${Number(indicQ.data.totais.tempo_medio_dias).toFixed(1)} d` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">SLA etapas</div>
                <div className="text-lg font-semibold">
                  {indicQ.data.sla?.percentual != null ? `${indicQ.data.sla.percentual}%` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {indicQ.data.sla?.dentro_prazo ?? 0}/{indicQ.data.sla?.total_etapas_avaliadas ?? 0} dentro do prazo
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Por responsável</div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {(indicQ.data.por_responsavel ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">Sem dados.</li>
              )}
              {(indicQ.data.por_responsavel ?? []).map((r: any) => (
                <li key={r.responsavel_id ?? "sem"} className="flex items-center justify-between gap-2 border-b pb-1 last:border-b-0">
                  <span className="truncate">{r.full_name ?? "— sem responsável —"}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {r.abertos} abertos · {r.concluidos} concl. {r.vencidos > 0 && <span className="text-red-700">· {r.vencidos} venc.</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Por tipo</div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {(indicQ.data.por_tipo ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">Sem dados.</li>
              )}
              {(indicQ.data.por_tipo ?? []).map((t: any) => (
                <li key={t.process_type_id} className="flex items-center justify-between gap-2 border-b pb-1 last:border-b-0">
                  <span className="flex min-w-0 items-center gap-2 truncate">
                    {t.cor && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full border" style={{ background: t.cor }} />}
                    <span className="truncate">{t.nome}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {t.abertos} abertos · {t.concluidos} concl. {t.vencidos > 0 && <span className="text-red-700">· {t.vencidos} venc.</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}


      <Card className="mb-3 p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={fClient} onValueChange={setFClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(clientsQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{clientLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(typesQ.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {PROCESS_STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={fPrio} onValueChange={setFPrio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PROCESS_PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Responsável</Label>
            <Select value={fResp} onValueChange={setFResp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(collabsQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prazo</Label>
            <Select value={fPrazo} onValueChange={setFPrazo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
                <SelectItem value="hoje">Vence hoje</SelectItem>
                <SelectItem value="em_breve">Vence em breve</SelectItem>
                <SelectItem value="sem_prazo">Sem prazo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ordenar por</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prazo">Prazo</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="responsavel">Responsável</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="progresso">Progresso</SelectItem>
                <SelectItem value="abertura">Data de abertura</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {activeFilters > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{activeFilters} filtro(s) ativo(s) · {totalRows} resultado(s)</span>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-2">
        {listQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : rows.length === 0 ? <EmptyState icon={<Workflow className="h-6 w-6" />} title="Nenhum processo" description="Ajuste os filtros ou crie um novo processo." />
          : (
            <ul className="divide-y">
              {rows.map((p: any) => (
                <li key={p.id}>
                  <ProcessListItem
                    audience="staff"
                    processId={p.id}
                    empresa={clientLabel(p.clients)}
                    tipoNome={p.process_types?.nome}
                    tipoCor={p.process_types?.cor}
                    status={p.status}
                    prioridade={p.prioridade}
                    responsavelNome={p.responsavel?.full_name}
                    prazoFinal={p.prazo_final}
                    totalEtapas={p.total_etapas}
                    etapasConcluidas={p.etapas_concluidas}
                    progresso={p.progresso}
                  />
                </li>
              ))}
            </ul>
          )}
        {totalRows > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t px-2 py-2 text-xs text-muted-foreground">
            <span>
              Página {page} de {totalPages} · {totalRows} processo(s)
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1 || listQ.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || listQ.isFetching} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}




function NewProcessDialog({ clients, types, collabs, onDone }: { clients: any[]; types: any[]; collabs: any[]; onDone: () => void }) {
  const [f, setF] = useState({
    client_id: "", process_type_id: "", responsavel_id: "", prazo_final: "", prioridade: "media", observacoes: "",
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("open_company_process", {
        _client_id: f.client_id,
        _process_type_id: f.process_type_id,
        _responsavel_id: f.responsavel_id || null,
        _prazo_final: f.prazo_final || null,
        _prioridade: f.prioridade,
        _observacoes: f.observacoes || null,
        _is_demo: false,
        _demo_batch_id: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { toast.success("Processo aberto"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao abrir processo"),
  });
  const canSave = !!f.client_id && !!f.process_type_id;
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Novo processo</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Empresa *</Label>
          <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{clientLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de processo *</Label>
          <Select value={f.process_type_id} onValueChange={(v) => setF({ ...f, process_type_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={f.responsavel_id} onValueChange={(v) => setF({ ...f, responsavel_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {collabs.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={f.prioridade} onValueChange={(v) => setF({ ...f, prioridade: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROCESS_PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo final</Label>
            <Input type="date" value={f.prazo_final} onChange={(e) => setF({ ...f, prazo_final: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Abrindo…" : "Abrir processo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
