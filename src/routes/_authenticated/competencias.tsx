import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import {
  currentCompetencia, formatCompetenciaLong, isValidCompetencia,
  shiftCompetencia,
} from "@/lib/competencia";
import { OFFICIAL_LABEL, OFFICIAL_TONE, type CompetenceRow, type OfficialStatus } from "@/lib/competence-status";
import {
  computeProgress, computeSituacao, progressInputsFromOverview, SITUACAO_LABEL,
  type CompetenceOverviewRow, type Situacao,
} from "@/lib/competence-progress";

import { ChevronLeft, ChevronRight, CalendarClock, Search, X, ArrowRight, Layers, Info, AlertTriangle } from "lucide-react";
import { MonthlyPreparationPanel } from "@/components/sc/MonthlyPreparationPanel";

// ----- Tipos ---------------------------------------------------------------
// Fase B2: tipo, fórmula de progresso e situação vivem em
// src/lib/competence-progress.ts (fonte única, sem duplicação nas rotas).

type OverviewRow = CompetenceOverviewRow;


const SITUACAO_TONE: Record<Situacao, string> = {
  sem_atividade: "bg-zinc-100 text-zinc-700",
  com_atrasos: "bg-red-100 text-red-800",
  aguardando_cliente: "bg-amber-100 text-amber-800",
  pronta_revisao: "bg-emerald-100 text-emerald-800",
  em_andamento: "bg-blue-100 text-blue-800",
};

const SITUACAO_ORDER: Record<Situacao, number> = {
  com_atrasos: 0,
  aguardando_cliente: 1,
  em_andamento: 2,
  pronta_revisao: 3,
  sem_atividade: 4,
};

// ----- Rota ----------------------------------------------------------------

export const Route = createFileRoute("/_authenticated/competencias")({
  component: CompetenciasPage,
  validateSearch: (search: Record<string, unknown>) => ({
    comp: isValidCompetencia(search.comp as string | undefined) ? (search.comp as string) : undefined,
  }),
  errorComponent: () => (
    <EmptyState
      icon={<Layers className="h-6 w-6" />}
      title="Não foi possível carregar a competência"
      description="Tente novamente."
    />
  ),
});

// ----- Página --------------------------------------------------------------

function CompetenciasPage() {
  const { role, loading } = useCurrentUser();
  const navigate = useNavigate({ from: "/competencias" });
  const routeSearch = Route.useSearch();

  const [comp, setComp] = useState<string>(routeSearch.comp ?? currentCompetencia());
  const [q, setQ] = useState("");
  const [fResp, setFResp] = useState<string>("all");
  const [fSituacao, setFSituacao] = useState<Situacao | "all">("all");
  const [fProg, setFProg] = useState<"all" | "0_25" | "25_50" | "50_75" | "75_100">("all");
  const [fAtraso, setFAtraso] = useState(false);
  const [fAgCliente, setFAgCliente] = useState(false);
  const [fDemo, setFDemo] = useState<"all" | "real" | "demo">("all");
  const [fAdmin, setFAdmin] = useState<"all" | "sem_competencia" | "sem_responsavel" | "divergencia">("all");
  const [sortBy, setSortBy] = useState<"padrao" | "nome" | "prog_asc" | "prog_desc" | "atrasos" | "pendencias" | "revisao">("padrao");

  const isAdmin = role === "admin";

  const isStaff = role === "admin" || role === "collaborator";
  const ready = !loading && isStaff;

  const setCompetencia = (next: string) => {
    setComp(next);
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, comp: next }) });
  };

  const overviewQuery = useQuery({
    queryKey: ["competence-overview", comp],
    enabled: ready && isValidCompetencia(comp),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_competence_overview", {
        p_competence: comp,
      });
      if (error) throw error;
      return (data ?? []) as OverviewRow[];
    },
  });

  const persistedQuery = useQuery({
    queryKey: ["competences-persisted", comp],
    enabled: ready && isValidCompetencia(comp),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_competences")
        .select("id, client_id, competence, status, responsible_profile_id, completed_at, completed_by")
        .eq("competence", comp);
      if (error) throw error;
      const map = new Map<string, Partial<CompetenceRow>>();
      (data ?? []).forEach((c: any) => map.set(c.client_id, c));
      return map;
    },
  });

  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    (overviewQuery.data ?? []).forEach((r) => {
      if (r.responsavel_nome) set.add(r.responsavel_nome);
    });
    return Array.from(set).sort();
  }, [overviewQuery.data]);

  const rows = useMemo(() => {
    const source = overviewQuery.data ?? [];
    const search = q.trim().toLowerCase();
    const list = source
      .filter((r) => {
        if (fDemo === "real" && r.is_demo) return false;
        if (fDemo === "demo" && !r.is_demo) return false;
        if (fResp !== "all" && (r.responsavel_nome ?? "") !== fResp) return false;
        if (search) {
          const hay = `${r.razao_social} ${r.nome_fantasia ?? ""}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map((r) => {
        const { percent, applicable } = computeProgress(progressInputsFromOverview(r));
        const situacao = computeSituacao(r);
        return { r, percent, applicable, situacao };
      })
      .filter(({ percent, situacao, r }) => {
        if (fSituacao !== "all" && situacao !== fSituacao) return false;
        if (fAtraso && situacao !== "com_atrasos") return false;
        if (fAgCliente && situacao !== "aguardando_cliente") return false;
        if (fProg !== "all") {
          if (fProg === "0_25" && !(percent < 25)) return false;
          if (fProg === "25_50" && !(percent >= 25 && percent < 50)) return false;
          if (fProg === "50_75" && !(percent >= 50 && percent < 75)) return false;
          if (fProg === "75_100" && !(percent >= 75)) return false;
        }
        // Filtros administrativos (Fase 4)
        const persisted = persistedQuery.data?.get(r.client_id);
        if (fAdmin === "sem_competencia" && persisted) return false;
        if (fAdmin === "sem_responsavel" && (persisted?.responsible_profile_id ?? null)) return false;
        if (fAdmin === "divergencia") {
          // Divergência: status oficial "completed" mas ainda há atrasos/pendências,
          // ou "open" com atividade significativa.
          const status = persisted?.status;
          const temAtividade = percent > 0 || situacao === "com_atrasos" || situacao === "aguardando_cliente";
          const divergente =
            (status === "completed" && (situacao === "com_atrasos" || situacao === "aguardando_cliente")) ||
            ((!status || status === "open") && temAtividade);
          if (!divergente) return false;
        }
        return true;
      });

    list.sort((a, b) => {
      switch (sortBy) {
        case "nome": return a.r.razao_social.localeCompare(b.r.razao_social);
        case "prog_asc": return a.percent - b.percent;
        case "prog_desc": return b.percent - a.percent;
        case "atrasos":
          return (b.r.pend_vencidas + b.r.guias_vencidas + b.r.proc_atrasados)
               - (a.r.pend_vencidas + a.r.guias_vencidas + a.r.proc_atrasados);
        case "pendencias":
          return b.r.pend_abertas - a.r.pend_abertas;
        case "revisao":
          return b.percent - a.percent;
        case "padrao":
        default: {
          const so = SITUACAO_ORDER[a.situacao] - SITUACAO_ORDER[b.situacao];
          if (so !== 0) return so;
          return a.percent - b.percent;
        }
      }
    });
    return list;
  }, [overviewQuery.data, persistedQuery.data, q, fResp, fSituacao, fProg, fAtraso, fAgCliente, fDemo, fAdmin, sortBy]);

  const activeFilters =
    (q ? 1 : 0) + (fResp !== "all" ? 1 : 0) + (fSituacao !== "all" ? 1 : 0) +
    (fProg !== "all" ? 1 : 0) + (fAtraso ? 1 : 0) + (fAgCliente ? 1 : 0) +
    (fDemo !== "all" ? 1 : 0) + (fAdmin !== "all" ? 1 : 0);

  const clearFilters = () => {
    setQ(""); setFResp("all"); setFSituacao("all"); setFProg("all");
    setFAtraso(false); setFAgCliente(false); setFDemo("all"); setFAdmin("all"); setSortBy("padrao");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!isStaff) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title="Acesso restrito"
        description="Apenas administradores e colaboradores acessam a Central de Competências nesta fase."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Competências"
        description="Visão mensal consolidada por empresa. Os indicadores são calculados a partir dos módulos existentes — não há duplicação de dados."
      />

      {isAdmin && (
        <MonthlyPreparationPanel competence={comp} onChangeCompetence={setCompetencia} />
      )}


      {/* Seletor de mês */}
      <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
        <Button variant="outline" size="icon" aria-label="Mês anterior"
          onClick={() => setCompetencia(shiftCompetencia(comp, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-[160px] items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatCompetenciaLong(comp)}</span>
        </div>
        <Button variant="outline" size="icon" aria-label="Próximo mês"
          onClick={() => setCompetencia(shiftCompetencia(comp, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setCompetencia(currentCompetencia())}
          disabled={comp === currentCompetencia()}>
          Mês atual
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Label className="text-xs">Ir para</Label>
          <Input
            type="month"
            className="h-9 w-[160px]"
            value={comp}
            onChange={(e) => {
              const v = e.target.value;
              if (isValidCompetencia(v)) setCompetencia(v);
            }}
          />
        </div>
      </Card>

      {/* Filtros */}
      <Card className="mb-3 p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Responsável</Label>
            <Select value={fResp} onValueChange={setFResp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {responsaveis.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Situação</Label>
            <Select value={fSituacao} onValueChange={(v: any) => setFSituacao(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="com_atrasos">Com atrasos</SelectItem>
                <SelectItem value="aguardando_cliente">Aguardando cliente</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="pronta_revisao">Pronta para revisão</SelectItem>
                <SelectItem value="sem_atividade">Sem atividade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Progresso</Label>
            <Select value={fProg} onValueChange={(v: any) => setFProg(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="0_25">0–25%</SelectItem>
                <SelectItem value="25_50">25–50%</SelectItem>
                <SelectItem value="50_75">50–75%</SelectItem>
                <SelectItem value="75_100">75–100%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ordenar por</Label>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao">Padrão</SelectItem>
                <SelectItem value="nome">Nome</SelectItem>
                <SelectItem value="prog_asc">Menor progresso</SelectItem>
                <SelectItem value="prog_desc">Maior progresso</SelectItem>
                <SelectItem value="atrasos">Mais atrasos</SelectItem>
                <SelectItem value="pendencias">Mais pendências</SelectItem>
                <SelectItem value="revisao">Mais próximas da revisão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={fAtraso} onChange={(e) => setFAtraso(e.target.checked)} />
            Somente com atrasos
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={fAgCliente} onChange={(e) => setFAgCliente(e.target.checked)} />
            Somente aguardando cliente
          </label>
          {role === "admin" && (
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Origem</Label>
              <Select value={fDemo} onValueChange={(v: any) => setFDemo(v)}>
                <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="real">Reais</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Label className="text-xs">Preparação</Label>
              <Select value={fAdmin} onValueChange={(v: any) => setFAdmin(v)}>
                <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="sem_competencia">Sem competência criada</SelectItem>
                  <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                  <SelectItem value="divergencia">Com divergência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {activeFilters > 0 && (
            <button className="ml-auto text-muted-foreground underline" onClick={clearFilters}>
              <X className="mr-1 inline h-3 w-3" />limpar filtros
            </button>
          )}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3" />
          O progresso é calculado com base nos itens aplicáveis desta competência.
        </p>
      </Card>

      {/* Lista */}
      {overviewQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando competência…</p>
      ) : overviewQuery.isError ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Não foi possível carregar a competência"
          description="Tente novamente."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Nenhuma empresa acessível"
          description="Ajuste os filtros ou selecione outra competência."
        />
      ) : (
        <div className="grid gap-2">
          {rows.map(({ r, percent, situacao }) => {
            const persisted = persistedQuery.data?.get(r.client_id) as Partial<CompetenceRow> | undefined;
            const official = persisted?.status as OfficialStatus | undefined;
            const mismatch =
              official && official !== "completed" &&
              (situacao === "com_atrasos" || situacao === "aguardando_cliente");
            return (
            <Card key={r.client_id} className="p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{clientLabel({ razao_social: r.razao_social, nome_fantasia: r.nome_fantasia, documento: null })}</span>
                    {r.is_demo && <Badge variant="outline" className="border-dashed">DEMO</Badge>}
                    {official ? (
                      <Badge className={OFFICIAL_TONE[official]}>Status oficial: {OFFICIAL_LABEL[official]}</Badge>
                    ) : (
                      <Badge variant="outline">Sem competência oficial</Badge>
                    )}
                    <Badge variant="outline" className={SITUACAO_TONE[situacao]}>Situação: {SITUACAO_LABEL[situacao]}</Badge>
                    <span className="text-xs text-muted-foreground">Responsável: {r.responsavel_nome ?? "—"}</span>
                    {persisted?.completed_at && (
                      <span className="text-xs text-emerald-700">Concluída em {new Date(persisted.completed_at as string).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                  {mismatch && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3 w-3" />
                      Divergência: status oficial "{OFFICIAL_LABEL[official!]}" x situação calculada "{SITUACAO_LABEL[situacao]}"
                    </div>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
                    <ModuleStat label="Checklist" value={`${r.checklist_concluido} de ${Math.max(0, r.checklist_total - r.checklist_cancelado)}`} sub={r.checklist_recebido > 0 ? `${r.checklist_recebido} recebidos` : undefined} />
                    <ModuleStat label="Pendências" value={`${r.pend_abertas} abertas`} tone={r.pend_vencidas > 0 ? "danger" : undefined} sub={r.pend_vencidas > 0 ? `${r.pend_vencidas} venc.` : undefined} />
                    <ModuleStat label="Solicitações" value={`${r.sol_aguardando_cliente} aguardando`} sub={`de ${r.sol_total}`} />
                    <ModuleStat label="Documentos" value={`${r.doc_total} no período`} />
                    <ModuleStat label="Guias" value={`${r.guias_com_comprovante} de ${r.guias_total}`} tone={r.guias_vencidas > 0 ? "danger" : undefined} sub={r.guias_vencidas > 0 ? `${r.guias_vencidas} venc.` : undefined} />
                    <ModuleStat label="Processos" value={`${r.proc_ativos} ativos`} tone={r.proc_atrasados > 0 ? "danger" : undefined} sub={r.proc_atrasados > 0 ? `${r.proc_atrasados} atrasados` : undefined} />
                  </div>
                </div>
                <div className="flex flex-col items-stretch justify-between gap-2">
                  <div>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-semibold">{percent}%</span>
                    </div>
                    <Progress value={percent} className="mt-1 h-2" />
                  </div>
                  <Button asChild size="sm">
                    <Link
                      to="/competencias/$clientId/$competence"
                      params={{ clientId: r.client_id, competence: comp }}
                    >
                      Abrir competência <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModuleStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`truncate text-sm font-medium ${tone === "danger" ? "text-red-700" : ""}`}>{value}</div>
      {sub && <div className={`truncate text-[10px] ${tone === "danger" ? "text-red-600" : "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}
