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

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  errorComponent: () => <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />,
});

/* ---------- helpers ---------- */
const today = () => todayLocalYmd();
const inDays = (n: number) => localYmdInDays(n);

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
  const summary = useMemo(() => summarizeCompetenceOverview(data), [data]);
  return { competencia, summary, error, isLoading: !data && !error };
}

function SituacaoCounts({ summary }: { summary: CompetenceSummary }) {
  const ordered: Situacao[] = ["com_atrasos", "aguardando_cliente", "sem_atividade", "em_andamento", "pronta_revisao"];
  const visible = ordered.filter((s) => summary.bySituacao[s] > 0);
  const SITUACAO_TONE: Record<Situacao, string> = {
    sem_atividade: "bg-zinc-100 text-zinc-700",
    com_atrasos: "bg-red-100 text-red-800",
    aguardando_cliente: "bg-amber-100 text-amber-800",
    pronta_revisao: "bg-emerald-100 text-emerald-800",
    em_andamento: "bg-blue-100 text-blue-800",
  };
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

  const clientsNoDocs = summary.semDocumentos.slice(0, 8);
  const atencao = summary.atencao.slice(0, 8);
  const SITUACAO_TONE: Record<Situacao, string> = {
    sem_atividade: "bg-zinc-100 text-zinc-700",
    com_atrasos: "bg-red-100 text-red-800",
    aguardando_cliente: "bg-amber-100 text-amber-800",
    pronta_revisao: "bg-emerald-100 text-emerald-800",
    em_andamento: "bg-blue-100 text-blue-800",
  };

  return (
    <div>
      <PageHeader title={`Bem-vindo, ${name?.split(" ")[0] || "administrador"}`} description="Visão operacional da Digital SC." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={AlertTriangle} label="Pendências vencidas" value={data?.tasksOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/pendencias" />
        <StatCard icon={Clock} label="Pendências de hoje" value={data?.tasksToday ?? "—"} accent="bg-amber-100 text-amber-800" to="/pendencias" />
        <StatCard icon={Inbox} label="Solicitações pendentes" value={data?.reqPending ?? "—"} accent="bg-sky-100 text-sky-800" to="/documentos" search={{ tab: "aguardando_cliente" }} />
        <StatCard icon={FileText} label="DOCUMENTOS RECEBIDOS" value={data?.docsAnalysis ?? "—"} accent="bg-blue-100 text-blue-800" to="/documentos" search={{ tab: "recebidos" }} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Situação das competências — {formatCompetenciaLong(competencia)}</h3>
          <SituacaoCounts summary={summary} />
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
        </Card>
      </div>
    </div>
  );
}

function CollabDashboard({ name, userId }: { name: string; userId: string }) {
  return <div>Colaborador Dashboard (simplificado para restauração)</div>;
}

function ClientDashboard({ name, userId }: { name: string; userId: string }) {
  return <div>Cliente Dashboard (simplificado para restauração)</div>;
}
