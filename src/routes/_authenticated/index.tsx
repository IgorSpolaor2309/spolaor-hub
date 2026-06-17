import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, UserCog, ClipboardList, AlertTriangle, FileText, Clock,
  Inbox, Receipt, ShieldCheck, MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { formatBR, todayLocalYmd, localYmdInDays } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

/* ---------- helpers ---------- */
const today = () => todayLocalYmd();
const inDays = (n: number) => localYmdInDays(n);
const currentCompetencia = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthRange = () => {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
  return { start, end };
};

const MONTH_STATUSES = [
  { value: "aguardando_documentos", label: "Aguardando documentos", tone: "bg-amber-100 text-amber-800" },
  { value: "documentos_recebidos", label: "Documentos recebidos", tone: "bg-sky-100 text-sky-800" },
  { value: "em_analise", label: "Em análise", tone: "bg-blue-100 text-blue-800" },
  { value: "pendencias_encontradas", label: "Pendências encontradas", tone: "bg-orange-100 text-orange-800" },
  { value: "em_fechamento", label: "Em fechamento", tone: "bg-indigo-100 text-indigo-800" },
  { value: "fechado", label: "Fechado", tone: "bg-emerald-100 text-emerald-800" },
  { value: "enviado_ao_cliente", label: "Enviado ao cliente", tone: "bg-teal-100 text-teal-800" },
];
const monthLabel = (v?: string | null) =>
  MONTH_STATUSES.find((s) => s.value === v) ?? { label: "Sem status", tone: "bg-zinc-100 text-zinc-700" };

/* ---------- shared UI ---------- */
function StatCard({
  icon: Icon, label, value, accent, to,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; accent?: string; to?: string }) {
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
  return to ? <Link to={to as any}>{inner}</Link> : inner;
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
  const { data } = useQuery({
    queryKey: ["dash-admin-v2"],
    queryFn: async () => {
      const t = today();
      const in7 = inDays(7);
      const in30 = inDays(30);
      const { start: monthStart } = monthRange();
      const competencia = currentCompetencia();

      const [
        clients, collabs,
        tasksOverdue, tasksToday,
        reqPending, docsAnalysis,
        guidesSoon, guidesOverdue,
        certsSoon,
        recentEvents,
        unassignedClients,
        collabTaskCounts,
        clientsActiveForMonth, docsThisMonth, monthStatuses,
      ] = await Promise.all([
        supabase.from("clients").select("id", { head: true, count: "exact" }).eq("status", "active"),
        supabase.from("collaborators").select("id", { head: true, count: "exact" }).eq("status", "active"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).lt("prazo", t).not("status", "in", "(concluida,cancelada)"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).eq("prazo", t).not("status", "in", "(concluida,cancelada)"),
        supabase.from("document_requests").select("id", { head: true, count: "exact" }).in("status", ["pendente", "reenviar"]),
        supabase.from("documents").select("id", { head: true, count: "exact" }).in("status", ["recebido", "em_analise"]),
        supabase.from("tax_guides").select("id", { head: true, count: "exact" }).gte("vencimento", t).lte("vencimento", in7).not("status", "in", "(paga,cancelada)"),
        supabase.from("tax_guides").select("id", { head: true, count: "exact" }).lt("vencimento", t).not("status", "in", "(paga,cancelada)"),
        supabase.from("documents").select("id, nome, data_validade, client_id, clients(razao_social)")
          .not("data_validade", "is", null).gte("data_validade", t).lte("data_validade", in30)
          .order("data_validade", { ascending: true }).limit(10),
        supabase.from("timeline_events").select("id, tipo, descricao, created_at, clients(razao_social)")
          .order("created_at", { ascending: false }).limit(6),
        supabase.from("clients").select("id, razao_social, client_collaborators(collaborator_id)").eq("status", "active"),
        supabase.from("pending_tasks").select("collaborator_id").not("status", "in", "(concluida,cancelada)").not("collaborator_id", "is", null),
        supabase.from("clients").select("id, razao_social").eq("status", "active"),
        supabase.from("documents").select("client_id").gte("created_at", monthStart),
        supabase.from("client_month_status").select("client_id, status, competencia").eq("competencia", competencia),
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


      const docsByClient = new Set((docsThisMonth.data ?? []).map((d: any) => d.client_id));
      const clientsNoDocs = (clientsActiveForMonth.data ?? []).filter((c: any) => !docsByClient.has(c.id)).slice(0, 8);

      const statusByClient = new Map<string, string>();
      for (const s of (monthStatuses.data ?? [])) statusByClient.set(s.client_id as string, s.status as string);
      const lateClosing = (clientsActiveForMonth.data ?? [])
        .map((c: any) => ({ ...c, status: statusByClient.get(c.id) ?? null }))
        .filter((c: any) => !c.status || ["aguardando_documentos", "documentos_recebidos", "pendencias_encontradas"].includes(c.status))
        .slice(0, 8);

      return {
        clients: clients.count ?? 0, collabs: collabs.count ?? 0,
        tasksOverdue: tasksOverdue.count ?? 0, tasksToday: tasksToday.count ?? 0,
        reqPending: reqPending.count ?? 0, docsAnalysis: docsAnalysis.count ?? 0,
        guidesSoon: guidesSoon.count ?? 0, guidesOverdue: guidesOverdue.count ?? 0,
        certsSoon: certsSoon.data ?? [],
        recentEvents: recentEvents.data ?? [],
        clientsNoCollab, topCollabs, clientsNoDocs, lateClosing,
      };
    },
  });

  return (
    <div>
      <PageHeader title={`Bem-vindo, ${name?.split(" ")[0] || "administrador"}`} description="Visão operacional da SC Central." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={AlertTriangle} label="Pendências vencidas" value={data?.tasksOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/pendencias" />
        <StatCard icon={Clock} label="Pendências de hoje" value={data?.tasksToday ?? "—"} accent="bg-amber-100 text-amber-800" to="/pendencias" />
        <StatCard icon={Inbox} label="Solicitações pendentes" value={data?.reqPending ?? "—"} accent="bg-sky-100 text-sky-800" to="/solicitacoes" />
        <StatCard icon={FileText} label="Docs aguardando análise" value={data?.docsAnalysis ?? "—"} accent="bg-blue-100 text-blue-800" to="/documentos" />
        <StatCard icon={Receipt} label="Guias vencendo (7 dias)" value={data?.guidesSoon ?? "—"} accent="bg-orange-100 text-orange-800" to="/guias" />
        <StatCard icon={Receipt} label="Guias vencidas" value={data?.guidesOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/guias" />
        <StatCard icon={Users} label="Clientes ativos" value={data?.clients ?? "—"} to="/clientes" />
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
          <h3 className="mb-3 font-display text-lg">Clientes sem colaborador atribuído</h3>
          {!(data?.clientsNoCollab?.length) ? <p className="text-sm text-muted-foreground">Todos os clientes têm colaborador.</p> : (
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
          <h3 className="mb-3 font-display text-lg">Clientes sem documentos do mês</h3>
          {!(data?.clientsNoDocs?.length) ? <p className="text-sm text-muted-foreground">Todos receberam documentos este mês.</p> : (
            <ul className="divide-y">
              {data!.clientsNoDocs.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <Link to="/clientes/$id" params={{ id: c.id }} className="text-sm font-medium text-primary hover:underline">{c.razao_social}</Link>
                  <Badge variant="outline">{currentCompetencia()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Fechamento do mês atrasado</h3>
          {!(data?.lateClosing?.length) ? <p className="text-sm text-muted-foreground">Tudo em dia.</p> : (
            <ul className="divide-y">
              {data!.lateClosing.map((c: any) => {
                const m = monthLabel(c.status);
                return (
                  <li key={c.id} className="flex items-center justify-between py-2.5">
                    <Link to="/clientes/$id" params={{ id: c.id }} className="text-sm font-medium text-primary hover:underline">{c.razao_social}</Link>
                    <Badge className={m.tone}>{m.label}</Badge>
                  </li>
                );
              })}
            </ul>
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
  const { data } = useQuery({
    queryKey: ["dash-collab-v2", userId],
    queryFn: async () => {
      const { data: collab } = await supabase.from("collaborators").select("id").eq("user_id", userId).maybeSingle();
      const { data: links } = collab?.id
        ? await supabase.from("client_collaborators").select("client_id").eq("collaborator_id", collab.id)
        : { data: [] as { client_id: string }[] };
      const ids = (links ?? []).map((l) => l.client_id);
      if (!ids.length) {
        return { clients: 0, tasksOverdue: 0, tasksToday: 0, docsAnalysis: 0, awaiting: 0, guidesSoon: 0, reqPending: 0, events: [] };
      }
      const t = today(); const in7 = inDays(7);
      const [tasksOverdue, tasksToday, docsAnalysis, awaitingReturn, guidesSoon, reqPending, events] = await Promise.all([
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).in("client_id", ids).lt("prazo", t).not("status", "in", "(concluida,cancelada)"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).in("client_id", ids).eq("prazo", t).not("status", "in", "(concluida,cancelada)"),
        supabase.from("documents").select("id", { head: true, count: "exact" }).in("client_id", ids).in("status", ["recebido", "em_analise"]),
        supabase.from("document_requests").select("id", { head: true, count: "exact" }).in("client_id", ids).eq("status", "enviado pelo cliente"),
        supabase.from("tax_guides").select("id", { head: true, count: "exact" }).in("client_id", ids).gte("vencimento", t).lte("vencimento", in7).not("status", "in", "(paga,cancelada)"),
        supabase.from("document_requests").select("id", { head: true, count: "exact" }).in("client_id", ids).in("status", ["pendente", "reenviar"]),
        supabase.from("timeline_events").select("id, descricao, created_at, clients(razao_social)").in("client_id", ids).order("created_at", { ascending: false }).limit(6),
      ]);
      return {
        clients: ids.length,
        tasksOverdue: tasksOverdue.count ?? 0, tasksToday: tasksToday.count ?? 0,
        docsAnalysis: docsAnalysis.count ?? 0, awaiting: awaitingReturn.count ?? 0,
        guidesSoon: guidesSoon.count ?? 0, reqPending: reqPending.count ?? 0,
        events: events.data ?? [],
      };
    },
  });

  return (
    <div>
      <PageHeader title={`Olá, ${name?.split(" ")[0] || "colaborador"}`} description="Operação dos seus clientes vinculados." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={AlertTriangle} label="Minhas vencidas" value={data?.tasksOverdue ?? "—"} accent="bg-destructive/10 text-destructive" to="/pendencias" />
        <StatCard icon={Clock} label="Pendências de hoje" value={data?.tasksToday ?? "—"} accent="bg-amber-100 text-amber-800" to="/pendencias" />
        <StatCard icon={FileText} label="Docs para analisar" value={data?.docsAnalysis ?? "—"} accent="bg-blue-100 text-blue-800" to="/documentos" />
        <StatCard icon={Inbox} label="Clientes aguardando retorno" value={data?.awaiting ?? "—"} accent="bg-sky-100 text-sky-800" to="/solicitacoes" />
        <StatCard icon={Receipt} label="Guias vencendo (7 dias)" value={data?.guidesSoon ?? "—"} accent="bg-orange-100 text-orange-800" to="/guias" />
        <StatCard icon={Inbox} label="Solicitações pendentes" value={data?.reqPending ?? "—"} accent="bg-secondary/10 text-secondary" to="/solicitacoes" />
        <StatCard icon={Users} label="Clientes vinculados" value={data?.clients ?? "—"} to="/clientes" />
      </div>

      <div className="mt-6">
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Atividades recentes dos meus clientes</h3>
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
  const { data } = useQuery({
    queryKey: ["dash-client-v2", userId, competencia],
    queryFn: async () => {
      const { data: cs } = await supabase.from("clients").select("id, razao_social").eq("owner_profile_id", userId);
      const ids = (cs ?? []).map((c) => c.id);
      const primary = (cs ?? [])[0] ?? null;
      if (!ids.length) return null;
      const t = today(); const in7 = inDays(7);
      const [requested, sent, openTasks, guidesAvail, guidesSoon, monthStatus, events] = await Promise.all([
        supabase.from("document_requests").select("id, titulo, status, prazo, categoria").in("client_id", ids).order("created_at", { ascending: false }).limit(20),
        supabase.from("documents").select("id, nome, status, created_at").in("client_id", ids).order("created_at", { ascending: false }).limit(5),
        supabase.from("pending_tasks").select("id, titulo, prazo, status").in("client_id", ids).not("status", "in", "(concluida,cancelada)").order("prazo", { ascending: true }).limit(5),
        supabase.from("tax_guides").select("id, tipo, vencimento, valor, status, storage_path").in("client_id", ids).not("status", "in", "(paga,cancelada)").order("vencimento", { ascending: true }).limit(8),
        supabase.from("tax_guides").select("id", { head: true, count: "exact" }).in("client_id", ids).gte("vencimento", t).lte("vencimento", in7).not("status", "in", "(paga,cancelada)"),
        primary ? supabase.from("client_month_status").select("status").eq("client_id", primary.id).eq("competencia", competencia).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("interactions").select("id, tipo, descricao, created_at").in("client_id", ids).order("created_at", { ascending: false }).limit(5),
      ]);
      const reqs = requested.data ?? [];
      const reqPending = reqs.filter((r: any) => ["pendente", "reenviar"].includes(r.status));
      const reqSent = reqs.filter((r: any) => ["enviado pelo cliente", "em análise", "aprovado"].includes(r.status));
      return {
        primary,
        status: (monthStatus as any)?.data?.status ?? null,
        reqAll: reqs, reqPending, reqSent,
        sent: sent.data ?? [],
        openTasks: openTasks.data ?? [],
        guides: guidesAvail.data ?? [],
        guidesSoon: guidesSoon.count ?? 0,
        events: events.data ?? [],
      };
    },
  });

  if (!data) return <div className="text-sm text-muted-foreground">Sem cliente vinculado.</div>;

  const m = monthLabel(data.status);

  return (
    <div>
      <PageHeader title={`Olá, ${name?.split(" ")[0] || "cliente"}`} description={`Status do mês ${competencia}`} />

      <Card className="mb-4 border-l-4 border-primary p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Status geral do mês</div>
            <div className="mt-1 font-display text-xl">{m.label}</div>
            {data.primary && <div className="mt-0.5 text-xs text-muted-foreground">{data.primary.razao_social}</div>}
          </div>
          <Badge className={`${m.tone} text-sm`}>{m.label}</Badge>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Inbox} label="Documentos solicitados" value={data.reqAll.length} to="/solicitacoes" />
        <StatCard icon={FileText} label="Enviados" value={data.reqSent.length} accent="bg-emerald-100 text-emerald-800" to="/meus-documentos" />
        <StatCard icon={AlertTriangle} label="Pendentes" value={data.reqPending.length} accent="bg-orange-100 text-orange-800" to="/solicitacoes" />
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
                  <div className="text-sm">{t.titulo}</div>
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
                    {r.categoria && <div className="text-xs text-muted-foreground">{r.categoria}</div>}
                  </div>
                  <Badge className="bg-orange-100 text-orange-800">{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Últimas interações</h3>
          {!data.events.length ? <p className="text-sm text-muted-foreground">Sem mensagens.</p> : (
            <ul className="space-y-3">
              {data.events.map((e: any) => (
                <li key={e.id}>
                  <div className="text-sm">{e.descricao}</div>
                  <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}</div>
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
   Status do mês — seletor inline reutilizável (exportado)
   ============================================================ */
export function MonthStatusSelector({ clientId, userId, onChanged }: { clientId: string; userId: string; onChanged?: () => void }) {
  const competencia = currentCompetencia();
  const { data, isLoading } = useQuery({
    queryKey: ["month-status", clientId, competencia],
    queryFn: async () =>
      (await supabase.from("client_month_status").select("status").eq("client_id", clientId).eq("competencia", competencia).maybeSingle()).data,
  });
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("client_month_status").upsert(
        { client_id: clientId, competencia, status, updated_by: userId },
        { onConflict: "client_id,competencia" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status do mês atualizado.");
      qc.invalidateQueries({ queryKey: ["month-status", clientId, competencia] });
      onChanged?.();
    },
    onError: (e: any) =>
      toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para alterar." : (e?.message ?? "Falha ao salvar.")),
  });

  const current = (data as any)?.status ?? "";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Status do mês ({competencia}):</span>
      <Select value={current || undefined} onValueChange={(v) => mut.mutate(v)} disabled={isLoading || mut.isPending}>
        <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="Definir status" /></SelectTrigger>
        <SelectContent>{MONTH_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
