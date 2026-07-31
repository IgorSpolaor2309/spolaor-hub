import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/sc/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { resolveRange } from "@/lib/date-ranges";
import {
  Users, UserCog, ClipboardList, AlertTriangle, FileText, Clock,
  Inbox, Receipt, ShieldCheck, MessageSquare, Layers,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBR, todayLocalYmd, localYmdInDays } from "@/lib/dates";
import { clientStatusLabel, clientStatusTone } from "@/lib/competence-client-labels";
import {
  SITUACAO_LABEL, TAX_GUIDE_CLOSED_STATUSES_PG,
  type CompetenceOverviewRow, type Situacao,
} from "@/lib/competence-progress";
import { summarizeCompetenceOverview, type CompetenceSummary } from "@/lib/competence-summary";
import { currentCompetencia, formatCompetenciaLong } from "@/lib/competencia";



export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
  errorComponent: () => <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />,
});

/* ---------- helpers ---------- */
const today = () => todayLocalYmd();
const inDays = (n: number) => localYmdInDays(n);

// Fase A2: a fonte oficial do status mensal é public.client_competences.
// Fase B3: o Dashboard lê a competência atual por get_competence_overview —
// a mesma RPC de /competencias — e agrega com summarizeCompetenceOverview.

const SITUACAO_TONE: Record<Situacao, string> = {
  sem_atividade: "bg-zinc-100 text-zinc-700",
  com_atrasos: "bg-red-100 text-red-800",
  aguardando_cliente: "bg-amber-100 text-amber-800",
  pronta_revisao: "bg-emerald-100 text-emerald-800",
  em_andamento: "bg-blue-100 text-blue-800",
};

/**
 * Fase B3 — chamada ÚNICA por Dashboard à visão mensal.
 * Mesma query key de /competencias: cache compartilhado, zero N+1,
 * e o filtro de período do Dashboard não participa da chave.
 */
function useCurrentCompetenceSummary(enabled: boolean) {
  const competencia = currentCompetencia();
  const { data, error } = useQuery({
    queryKey: ["competence-overview", competencia],
    enabled,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_competence_overview", {
        p_competence: competencia,
      });
      if (error) throw error;
      return (data ?? []) as CompetenceOverviewRow[];
    },
  });
  // Dashboard operacional = ambiente Real. Inativas/excluídas já não vêm da RPC.
  const summary = useMemo(() => summarizeCompetenceOverview(data), [data]);
  return { competencia, summary, error, isLoading: !data && !error };
}

/** Contagens por situação canônica, em linha e sem cards adicionais. */
function SituacaoCounts({ summary }: { summary: CompetenceSummary }) {
  const ordered: Situacao[] = ["com_atrasos", "aguardando_cliente", "sem_atividade", "em_andamento", "pronta_revisao"];
  const visible = ordered.filter((s) => summary.bySituacao[s] > 0);
  if (!visible.length) return <span className="text-sm text-muted-foreground">Sem competências no mês.</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((s) => (
        <Badge key={s} className={SITUACAO_TONE[s]}>
          {SITUACAO_LABEL[s]} <span className="ml-1 font-semibold">{summary.bySituacao[s]}</span>
        </Badge>
      ))}
    </div>
  );
}



/* ---------- shared UI ---------- */
function StatCard({
  icon: Icon, label, value, accent, to, search,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; accent?: string; to?: string; search?: Record<string, string | number | undefined> }) {
  const inner = (
    <Card className="h-full p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl">{value}</div>
        </div>
        <div className={`rounded-lg p-2 ${accent ?? "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
  return to ? <Link to={to as any} search={(search ?? {}) as any}>{inner}</Link> : inner;
}

/* ---------- root ---------- */
function Dashboard() {
  const { role, profile, userId, loading } = useCurrentUser();

  if (loading || !userId) {
    return <div className="text-sm text-muted-foreground">Carregando informações...</div>;
  }
  if (role === "admin") return <AdminDashboard name={profile?.full_name ?? ""} />;
  if (role === "collaborator") return <CollabDashboard name={profile?.full_name ?? ""} userId={userId} />;
  if (role === "client") return <ClientDashboard name={profile?.full_name ?? ""} userId={userId} />;
  return <div className="text-sm text-muted-foreground">Carregando informações...</div>;
}

/* ============================================================
   ADMIN
   ============================================================ */
function AdminDashboard({ name }: { name: string }) {
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const { competencia, summary, error: overviewError } = useCurrentCompetenceSummary(true);
  const { data, error } = useQuery({
    queryKey: ["dash-admin-v3", range.from, range.to],
    retry: 1,
    queryFn: async () => {
      const t = today();
      const in7 = inDays(7);
      const in30 = inDays(30);
      const dFrom = range.from ? `${range.from}T00:00:00` : null;
      const dTo = range.to ? `${range.to}T23:59:59` : null;
      const scope = (q: any) => {
        if (dFrom) q = q.gte("created_at", dFrom);
        if (dTo) q = q.lte("created_at", dTo);
        return q;
      };

      const [
        clients, collabs,
        tasksOverdue, tasksToday,
        reqPending, docsAnalysis,
        guidesSoon, guidesOverdue,
        certsSoon,
        recentEvents,
        unassignedClients,
        collabTaskCounts,
      ] = await Promise.all([
        supabase.from("clients").select("id", { head: true, count: "exact" }).eq("status", "active").is("deleted_at", null),
        supabase.from("collaborators").select("id", { head: true, count: "exact" }).eq("status", "active"),
        scope(supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).lt("prazo", t).not("status", "in", "(concluida,cancelada)")),
        scope(supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).eq("prazo", t).not("status", "in", "(concluida,cancelada)")),
        scope(supabase.from("document_requests").select("id", { head: true, count: "exact" }).in("status", ["aguardando", "reenviar"])),
        scope(supabase.from("documents").select("id", { head: true, count: "exact" }).in("status", ["recebido", "em_analise"])),
        scope(supabase.from("tax_guides").select("id", { head: true, count: "exact" }).gte("vencimento", t).lte("vencimento", in7).not("status", "in", TAX_GUIDE_CLOSED_STATUSES_PG)),
        scope(supabase.from("tax_guides").select("id", { head: true, count: "exact" }).lt("vencimento", t).not("status", "in", TAX_GUIDE_CLOSED_STATUSES_PG)),
        supabase.from("documents").select("id, nome, data_validade, client_id, clients(razao_social)")
          .not("data_validade", "is", null).gte("data_validade", t).lte("data_validade", in30)
          .order("data_validade", { ascending: true }).limit(10),
        scope(supabase.from("timeline_events").select("id, tipo, descricao, created_at, clients(razao_social)")
          .order("created_at", { ascending: false }).limit(6)),
        supabase.from("clients").select("id, razao_social, client_collaborators(collaborator_id)").eq("status", "active").is("deleted_at", null),
        supabase.from("pending_tasks").select("collaborator_id").not("status", "in", "(concluida,cancelada)").not("collaborator_id", "is", null),
      ]);
      const failures = [clients, collabs, tasksOverdue, tasksToday, reqPending, docsAnalysis, guidesSoon, guidesOverdue, certsSoon, recentEvents, unassignedClients, collabTaskCounts].filter((r) => r.error);

      if (failures.length) console.warn("[dashboard-admin] consultas parciais falharam", failures.map((r) => r.error?.message));

      const clientsNoCollab = (unassignedClients.data ?? []).filter((c: any) => !(c.client_collaborators ?? []).length).slice(0, 8);

      const counts = new Map<string, number>();
      for (const r of (collabTaskCounts.data ?? []) as any[]) {
        const k = r.collaborator_id as string;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const profileIds = topIds.map(([id]) => id);
      const profilesRes = profileIds.length
        ? (await supabase.from("profiles").select("id, full_name, email").in("id", profileIds)).data ?? []
        : [];
      const topCollabs = topIds.map(([id, n]) => {
        const p = (profilesRes as any[]).find((x) => x.id === id);
        return { id, n, nome: p?.full_name || p?.email || "Sem nome" };
      });

      return {
        clients: clients.count ?? 0, collabs: collabs.count ?? 0,
        tasksOverdue: tasksOverdue.count ?? 0, tasksToday: tasksToday.count ?? 0,
        reqPending: reqPending.count ?? 0, docsAnalysis: docsAnalysis.count ?? 0,
        guidesSoon: guidesSoon.count ?? 0, guidesOverdue: guidesOverdue.count ?? 0,
        certsSoon: certsSoon.data ?? [],
        recentEvents: recentEvents.data ?? [],
        clientsNoCollab, topCollabs,
      };
    },
  });

  // Fase B3: "sem documentos do mês" e a situação mensal saem da MESMA linha do
  // overview (doc_total / computeSituacao) — nenhuma contagem por created_at.
  const clientsNoDocs = summary.semDocumentos.slice(0, 8);
  const atencao = summary.atencao.slice(0, 8);


  return (
    <div>
      <PageHeader title={`Bem-vindo, ${name?.split(" ")[0] || "administrador"}`} description="Visão operacional da SC Central." />
      {error && <Card className="mb-4 p-4 text-sm text-muted-foreground">Não foi possível carregar todos os dados. Tente novamente.</Card>}

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <DateRangeFilter value={dateF} onChange={setDateF} label="Período" />
        <Button variant="ghost" size="sm" onClick={() => setDateF(EMPTY_DATE_FILTER)}>Limpar</Button>
      </Card>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={AlertTriangle} label="Pendências vencidas" value={data?.tasksOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/pendencias" />
        <StatCard icon={Clock} label="Pendências de hoje" value={data?.tasksToday ?? "—"} accent="bg-amber-100 text-amber-800" to="/pendencias" />
        <StatCard icon={Inbox} label="Solicitações pendentes" value={data?.reqPending ?? "—"} accent="bg-sky-100 text-sky-800" to="/documentos" search={{ tab: "aguardando_cliente" }} />
        <StatCard icon={FileText} label="DOCUMENTOS RECEBIDOS" value={data?.docsAnalysis ?? "—"} accent="bg-blue-100 text-blue-800" to="/documentos" search={{ tab: "recebidos" }} />
        <StatCard icon={Receipt} label="Guias vencendo (7 dias)" value={data?.guidesSoon ?? "—"} accent="bg-orange-100 text-orange-800" to="/guias" />
        <StatCard icon={Receipt} label="Guias vencidas" value={data?.guidesOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/guias" />
        <StatCard icon={Users} label="Empresas ativas" value={data?.clients ?? "—"} to="/clientes" />
        <StatCard icon={UserCog} label="Colaboradores ativos" value={data?.collabs ?? "—"} accent="bg-secondary/10 text-secondary" to="/colaboradores" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Certificados vencendo em 30 dias</h3>
          {!(data?.certsSoon?.length) ? <p className="text-sm text-muted-foreground">Nenhum certificado próximo do vencimento.</p> : (
            <ul className="divide-y">
              {data!.certsSoon.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{d.clients?.razao_social ?? "—"}</div>
                  </div>
                  <Badge className="bg-orange-100 text-orange-800">{formatBR(d.data_validade)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Empresas sem colaborador atribuído</h3>
          {!(data?.clientsNoCollab?.length) ? <p className="text-sm text-muted-foreground">Todas as empresas têm colaborador.</p> : (
            <ul className="divide-y">
              {data!.clientsNoCollab.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <Link to="/clientes/$id" params={{ id: c.id }} className="text-sm font-medium text-primary hover:underline">{c.razao_social}</Link>
                  <Badge className="bg-amber-100 text-amber-800">sem colaborador</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Empresas sem documentos do mês</h3>
          {!clientsNoDocs.length ? <p className="text-sm text-muted-foreground">Todos receberam documentos este mês.</p> : (
            <ul className="divide-y">
              {clientsNoDocs.map((c) => (
                <li key={c.client_id} className="flex items-center justify-between py-2.5">
                  <Link to="/clientes/$id" params={{ id: c.client_id }} className="text-sm font-medium text-primary hover:underline">{c.razao_social}</Link>
                  <Badge variant="outline">{competencia}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Fase B3 — mesmo espaço do antigo "Competências do mês em aberto",
            agora alimentado pela mesma RPC de /competencias. */}
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Situação das competências — {formatCompetenciaLong(competencia)}
            </h3>
            <Link to="/competencias" search={{ comp: competencia }} className="text-xs font-medium text-primary hover:underline">
              Ver Competências
            </Link>
          </div>
          {overviewError ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar a situação do mês.</p>
          ) : (
            <>
              <SituacaoCounts summary={summary} />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{summary.total} competência{summary.total === 1 ? "" : "s"} no mês</span>
                <span aria-hidden>·</span>
                <Link to="/processos" search={{} as any} className="font-medium text-primary hover:underline">
                  {summary.procAtrasados} processo{summary.procAtrasados === 1 ? "" : "s"} atrasado{summary.procAtrasados === 1 ? "" : "s"}
                </Link>
              </div>
              {atencao.length > 0 && (
                <ul className="mt-3 divide-y">
                  {atencao.map((c) => (
                    <li key={c.client_id} className="flex items-center justify-between gap-2 py-2">
                      <Link to="/clientes/$id" params={{ id: c.client_id }} className="min-w-0 truncate text-sm font-medium text-primary hover:underline">{c.razao_social}</Link>
                      <Badge className={SITUACAO_TONE[c.situacao]}>{SITUACAO_LABEL[c.situacao]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>


        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Colaboradores com mais pendências abertas</h3>
          {!(data?.topCollabs?.length) ? <p className="text-sm text-muted-foreground">Nenhuma pendência atribuída.</p> : (
            <ul className="divide-y">
              {data!.topCollabs.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <div className="text-sm font-medium">{c.nome}</div>
                  <Badge>{c.n}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Atividade recente</h3>
          {!(data?.recentEvents?.length) ? <p className="text-sm text-muted-foreground">Sem eventos.</p> : (
            <ul className="space-y-3">
              {data!.recentEvents.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{e.descricao}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.clients?.razao_social} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   COLABORADOR
   ============================================================ */
function CollabDashboard({ name, userId }: { name: string; userId: string }) {
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  // Fase B3 — mesma fonte mensal do Administrador; a RLS já limita à carteira.
  const { competencia, summary, error: overviewError } = useCurrentCompetenceSummary(!!userId);
  const { data, error } = useQuery({

    queryKey: ["dash-collab-v2", userId, range.from, range.to],
    enabled: !!userId,
    retry: 1,
    queryFn: async () => {
      const { data: collab, error: collabErr } = await supabase.from("collaborators").select("id").eq("user_id", userId).maybeSingle();
      if (collabErr) throw collabErr;
      const { data: links } = collab?.id
        ? await supabase.from("client_collaborators").select("client_id").eq("collaborator_id", collab.id)
        : { data: [] as { client_id: string }[] };
      const ids = (links ?? []).map((l) => l.client_id);
      if (!ids.length) {
        return { clients: 0, tasksOverdue: 0, tasksToday: 0, docsAnalysis: 0, awaiting: 0, guidesSoon: 0, reqPending: 0, events: [] };
      }
      const t = today(); const in7 = inDays(7);
      const dFrom = range.from ? `${range.from}T00:00:00` : null;
      const dTo = range.to ? `${range.to}T23:59:59` : null;
      const scope = (q: any) => {
        if (dFrom) q = q.gte("created_at", dFrom);
        if (dTo) q = q.lte("created_at", dTo);
        return q;
      };
      const [tasksOverdue, tasksToday, docsAnalysis, awaitingReturn, guidesSoon, reqPending, events] = await Promise.all([
        scope(supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).in("client_id", ids).lt("prazo", t).not("status", "in", "(concluida,cancelada)")),
        scope(supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).in("client_id", ids).eq("prazo", t).not("status", "in", "(concluida,cancelada)")),
        scope(supabase.from("documents").select("id", { head: true, count: "exact" }).in("client_id", ids).in("status", ["recebido", "em_analise"])),
        scope(supabase.from("document_requests").select("id", { head: true, count: "exact" }).in("client_id", ids).eq("status", "recebido")),
        scope(supabase.from("tax_guides").select("id", { head: true, count: "exact" }).in("client_id", ids).gte("vencimento", t).lte("vencimento", in7).not("status", "in", TAX_GUIDE_CLOSED_STATUSES_PG)),
        scope(supabase.from("document_requests").select("id", { head: true, count: "exact" }).in("client_id", ids).in("status", ["aguardando", "reenviar"])),
        scope(supabase.from("timeline_events").select("id, descricao, created_at, clients(razao_social)").in("client_id", ids).order("created_at", { ascending: false }).limit(6)),
      ]);
      const failures = [tasksOverdue, tasksToday, docsAnalysis, awaitingReturn, guidesSoon, reqPending, events].filter((r) => r.error);
      if (failures.length) console.warn("[dashboard-collab] consultas parciais falharam", failures.map((r) => r.error?.message));
      return {
        clients: ids.length,
        tasksOverdue: tasksOverdue.count ?? 0, tasksToday: tasksToday.count ?? 0,
        docsAnalysis: docsAnalysis.count ?? 0, awaiting: awaitingReturn.count ?? 0,
        guidesSoon: guidesSoon.count ?? 0, reqPending: reqPending.count ?? 0,
        events: events.data ?? [],
      };
    },
  });

  const noClients = !!data && data.clients === 0;

  return (
    <div>
      <PageHeader title={`Olá, ${name?.split(" ")[0] || "colaborador"}`} description="Operação das empresas vinculadas a você." />
      {error && <Card className="mb-4 p-4 text-sm text-muted-foreground">Não foi possível carregar todos os dados. Tente novamente.</Card>}
      {noClients && (
        <Card className="mb-4 p-4">
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Você ainda não está vinculado a nenhuma empresa"
            description="Assim que um administrador te designar como responsável por uma empresa, ela aparecerá aqui."
          />
        </Card>
      )}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <DateRangeFilter value={dateF} onChange={setDateF} label="Período" />
        <Button variant="ghost" size="sm" onClick={() => setDateF(EMPTY_DATE_FILTER)}>Limpar</Button>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">


        <StatCard icon={AlertTriangle} label="Minhas vencidas" value={data?.tasksOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/pendencias" />
        <StatCard icon={Clock} label="Pendências de hoje" value={data?.tasksToday ?? "—"} accent="bg-amber-100 text-amber-800" to="/pendencias" />
        <StatCard icon={FileText} label="Docs para analisar" value={data?.docsAnalysis ?? "—"} accent="bg-blue-100 text-blue-800" to="/documentos" search={{ tab: "recebidos" }} />
        <StatCard icon={Inbox} label="Solicitações recebidas para análise" value={data?.awaiting ?? "—"} accent="bg-sky-100 text-sky-800" to="/documentos" search={{ tab: "recebidos" }} />
        <StatCard icon={Receipt} label="Guias vencendo (7 dias)" value={data?.guidesSoon ?? "—"} accent="bg-orange-100 text-orange-800" to="/guias" />
        <StatCard icon={Inbox} label="Solicitações pendentes" value={data?.reqPending ?? "—"} accent="bg-secondary/10 text-secondary" to="/documentos" search={{ tab: "aguardando_cliente" }} />
        <StatCard icon={Users} label="Empresas vinculadas" value={data?.clients ?? "—"} to="/clientes" />
      </div>

      <div className="mt-6">
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Atividades recentes das minhas empresas</h3>
          {!(data?.events?.length) ? <p className="text-sm text-muted-foreground">Sem atividade.</p> : (
            <ul className="space-y-3">
              {data!.events.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                  <div className="min-w-0">
                    <div className="text-sm">{e.descricao}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.clients?.razao_social} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTE — Status do mês
   ============================================================ */
function ClientDashboard({ name, userId }: { name: string; userId: string }) {
  const qc = useQueryClient();
  const competencia = currentCompetencia();

  // Lista as empresas/CNPJs do cliente (RLS filtra; suporta multiempresa).
  const { data: myCompanies = [], error: companiesError } = useQuery({
    queryKey: ["dash-client-companies", userId],
    enabled: !!userId,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  // "" = todas; senão um id específico.
  const STORAGE_KEY = "sc.dashboardSelectedClient";
  const initial = (typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY)) || "";
  const [selected, setSelected] = useState<string>(initial);
  const onSelectChange = (v: string) => {
    setSelected(v);
    try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* noop */ }
  };

  const allIds = myCompanies.map((c: any) => c.id);
  const scopedIds = selected && allIds.includes(selected) ? [selected] : allIds;
  const isAll = !selected || scopedIds.length !== 1;

  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);

  const { data, error: dataError } = useQuery({
    queryKey: ["dash-client-v3", userId, competencia, scopedIds.join(","), range.from, range.to],
    enabled: scopedIds.length > 0,
    retry: 1,
    queryFn: async () => {
      const ids = scopedIds;
      const primary = myCompanies.find((c: any) => c.id === ids[0]) ?? myCompanies[0] ?? null;
      const t = today(); const in7 = inDays(7);
      const dFrom = range.from ? `${range.from}T00:00:00` : null;
      const dTo = range.to ? `${range.to}T23:59:59` : null;
      const scope = (q: any) => {
        if (dFrom) q = q.gte("created_at", dFrom);
        if (dTo) q = q.lte("created_at", dTo);
        return q;
      };
      // Cliente: leitura de solicitações via RPC segura (sem observacoes_internas).
      const reqCalls = ids.map((cid) =>
        supabase.rpc("client_list_document_requests", { p_client_id: cid, p_limit: 20, p_offset: 0 })
      );
      const [reqResults, sent, openTasks, guidesAvail, guidesSoon, monthStatus] = await Promise.all([
        Promise.all(reqCalls),
        scope(supabase.from("documents").select("id, nome, status, created_at, client_id, clients(razao_social, nome_fantasia)").in("client_id", ids).order("created_at", { ascending: false }).limit(5)),
        scope(supabase.from("pending_tasks").select("id, titulo, prazo, status, client_id, clients(razao_social, nome_fantasia)").in("client_id", ids).not("status", "in", "(concluida,cancelada)").order("prazo", { ascending: true }).limit(8)),
        supabase.from("tax_guides").select("id, tipo, vencimento, valor, status, storage_path, client_id, clients(razao_social, nome_fantasia)").in("client_id", ids).not("status", "in", TAX_GUIDE_CLOSED_STATUSES_PG).order("vencimento", { ascending: true }).limit(8),
        supabase.from("tax_guides").select("id", { head: true, count: "exact" }).in("client_id", ids).gte("vencimento", t).lte("vencimento", in7).not("status", "in", TAX_GUIDE_CLOSED_STATUSES_PG),
        // Fase A2: fonte oficial segura para o cliente (mesma usada em /meu-mes).
        !isAll && primary
          ? supabase.rpc("get_client_competence_portal", { p_client_id: primary.id, p_competence: competencia })
          : Promise.resolve({ data: null }),
      ]);
      const failures = [sent, openTasks, guidesAvail, guidesSoon, monthStatus].filter((r: any) => r.error);

      if (failures.length) console.warn("[dashboard-client] consultas parciais falharam", failures.map((r: any) => r.error?.message));
      const companyLabel = new Map<string, any>();
      for (const c of myCompanies as any[]) companyLabel.set(c.id, { razao_social: c.razao_social, nome_fantasia: c.nome_fantasia });
      const reqs = reqResults.flatMap((r: any) =>
        (r.data ?? []).map((row: any) => ({
          id: row.id, titulo: row.titulo, status: row.status, prazo: row.prazo,
          categoria: row.categoria, client_id: row.client_id,
          clients: companyLabel.get(row.client_id) ?? null,
        }))
      );
      const reqPending = reqs.filter((r: any) => ["aguardando", "reenviar"].includes(r.status));
      const reqSent = reqs.filter((r: any) => r.status === "recebido");
      return {
        primary,
        status: ((monthStatus as any)?.data?.status ?? null) as string | null,
        hasCompetence: !!((monthStatus as any)?.data?.has_competence),

        reqAll: reqs, reqPending, reqSent,
        sent: sent.data ?? [],
        openTasks: openTasks.data ?? [],
        guides: guidesAvail.data ?? [],
        guidesSoon: guidesSoon.count ?? 0,

      };
    },
  });

  if (companiesError) return <div className="text-sm text-muted-foreground">Não foi possível carregar os dados. Tente novamente.</div>;
  if (myCompanies.length === 0) return <div className="text-sm text-muted-foreground">Sem empresa vinculada.</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  // Linguagem externa (nunca expõe status interno, responsável ou notas internas).
  const clientLabel = data.hasCompetence ? clientStatusLabel(data.status) : "Ainda não iniciada";
  const clientTone = data.hasCompetence ? clientStatusTone(data.status) : clientStatusTone(null);

  const empresaName = (c: any) => c?.nome_fantasia || c?.razao_social || "Empresa";

  return (
    <div>
      <PageHeader title={`Olá, ${name?.split(" ")[0] || "cliente"}`} description={`Status do mês ${competencia}`} />
      {dataError && <Card className="mb-4 p-4 text-sm text-muted-foreground">Não foi possível carregar todos os dados. Tente novamente.</Card>}

      {myCompanies.length > 1 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Empresa</div>
          <Select value={selected || "__all__"} onValueChange={(v) => onSelectChange(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as empresas ({myCompanies.length})</SelectItem>
              {myCompanies.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {empresaName(c)}{c.documento ? ` · ${c.documento}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <DateRangeFilter value={dateF} onChange={setDateF} label="Período" />
        <Button variant="ghost" size="sm" onClick={() => setDateF(EMPTY_DATE_FILTER)}>Limpar</Button>
      </Card>


      {!isAll && (
        <Card className="mb-4 border-l-4 border-primary p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Status geral do mês</div>
              <div className="mt-1 font-display text-xl">{clientLabel}</div>
              {data.primary && <div className="mt-0.5 text-xs text-muted-foreground">{empresaName(data.primary)}</div>}
            </div>
            <Badge className={`${clientTone} text-sm`}>{clientLabel}</Badge>

          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Inbox} label="Documentos solicitados" value={data.reqAll.length} to="/meus-documentos" search={{ section: "precisa_enviar", client: data.primary?.id }} />
        <StatCard icon={FileText} label="Enviados" value={data.reqSent.length} accent="bg-emerald-100 text-emerald-800" to="/meus-documentos" />
        <StatCard icon={AlertTriangle} label="Pendências" value={data.reqPending.length + data.openTasks.length} accent="bg-orange-100 text-orange-800" to="/pendencias" />
        <StatCard icon={Receipt} label="Guias próximas (7d)" value={data.guidesSoon} accent="bg-amber-100 text-amber-800" to="/guias" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Guias disponíveis</h3>
          {!data.guides.length ? <p className="text-sm text-muted-foreground">Nenhuma guia em aberto.</p> : (
            <ul className="divide-y">
              {data.guides.map((g: any) => (
                <li key={g.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{g.tipo}</div>
                    <div className="text-xs text-muted-foreground">
                      {isAll && (g.clients?.nome_fantasia || g.clients?.razao_social) && (
                        <>Empresa: {g.clients?.nome_fantasia || g.clients?.razao_social} · </>
                      )}
                      {g.vencimento ? `Vence ${formatBR(g.vencimento)}` : "—"}
                      {g.valor != null ? ` · R$ ${Number(g.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline">{g.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Pendências abertas</h3>
          {!data.openTasks.length ? <p className="text-sm text-muted-foreground">Nenhuma pendência. 🎉</p> : (
            <ul className="divide-y">
              {data.openTasks.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm">{t.titulo}</div>
                    {isAll && (t.clients?.nome_fantasia || t.clients?.razao_social) && (
                      <div className="text-xs text-muted-foreground">Empresa: {t.clients?.nome_fantasia || t.clients?.razao_social}</div>
                    )}
                  </div>
                  <Badge variant="outline">{t.prazo ? formatBR(t.prazo) : "—"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Documentos pendentes (solicitados)</h3>
          {!data.reqPending.length ? <p className="text-sm text-muted-foreground">Nenhum documento pendente.</p> : (
            <ul className="divide-y">
              {data.reqPending.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">{r.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.categoria}
                      {isAll && (r.clients?.nome_fantasia || r.clients?.razao_social) && (
                        <>{r.categoria ? " · " : ""}Empresa: {r.clients?.nome_fantasia || r.clients?.razao_social}</>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-orange-100 text-orange-800">{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>


      <button hidden onClick={() => { void qc; void toast; }} />
    </div>
  );
}

/* ============================================================
   Fase A2 — MonthStatusSelector removido.
   O status mensal passou a ser controlado exclusivamente pelo ciclo oficial
   da competência (public.client_competences) na Central de Competências.
   Escritas em client_month_status foram revogadas no banco.
   Exibição inline: @/components/sc/CompetenceStatusInline
   ============================================================ */

