import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Users, UserCog, ClipboardList, AlertTriangle, FileText, Clock } from "lucide-react";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function StatCard({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; accent?: string }) {
  return (
    <Card className="p-5">
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
  const { data } = useQuery({
    queryKey: ["dash-admin"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const [clients, collabs, openTasks, overdue, soon, recentDocs, recentEvents] = await Promise.all([
        supabase.from("clients").select("id", { head: true, count: "exact" }).eq("status", "active"),
        supabase.from("collaborators").select("id", { head: true, count: "exact" }).eq("status", "active"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).not("status", "in", "(concluida,cancelada)"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).lt("prazo", today).not("status", "in", "(concluida,cancelada)"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).gte("prazo", today).lte("prazo", in7).not("status", "in", "(concluida,cancelada)"),
        supabase.from("documents").select("id, nome, tipo, status, created_at, client_id, clients(razao_social)").order("created_at", { ascending: false }).limit(5),
        supabase.from("timeline_events").select("id, tipo, descricao, created_at, client_id, clients(razao_social)").order("created_at", { ascending: false }).limit(6),
      ]);
      return {
        clients: clients.count ?? 0, collabs: collabs.count ?? 0,
        openTasks: openTasks.count ?? 0, overdue: overdue.count ?? 0, soon: soon.count ?? 0,
        recentDocs: recentDocs.data ?? [], recentEvents: recentEvents.data ?? [],
      };
    },
  });

  return (
    <div>
      <PageHeader title={`Bem-vindo, ${name?.split(" ")[0] || "administrador"}`} description="Visão geral da operação SC Central." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={Users} label="Clientes ativos" value={data?.clients ?? "—"} />
        <StatCard icon={UserCog} label="Colaboradores ativos" value={data?.collabs ?? "—"} accent="bg-secondary/10 text-secondary" />
        <StatCard icon={ClipboardList} label="Pendências abertas" value={data?.openTasks ?? "—"} accent="bg-info/10 text-info" />
        <StatCard icon={AlertTriangle} label="Vencidas" value={data?.overdue ?? "—"} accent="bg-destructive/10 text-destructive" />
        <StatCard icon={Clock} label="Próximas (7 dias)" value={data?.soon ?? "—"} accent="bg-warning/15 text-warning-foreground" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Documentos recentes</h3>
            <Link to="/documentos" className="text-xs text-secondary hover:underline">Ver todos</Link>
          </div>
          {(!data?.recentDocs?.length) ? <p className="text-sm text-muted-foreground">Nenhum documento ainda.</p> : (
            <ul className="divide-y">
              {data!.recentDocs.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{d.clients?.razao_social ?? "—"}</div>
                  </div>
                  <StatusBadge value={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg">Atividade recente</h3>
          </div>
          {(!data?.recentEvents?.length) ? <p className="text-sm text-muted-foreground">Sem eventos.</p> : (
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

function CollabDashboard({ name, userId }: { name: string; userId: string }) {
  const { data } = useQuery({
    queryKey: ["dash-collab", userId],
    queryFn: async () => {
      const { data: collab } = await supabase.from("collaborators").select("id").eq("user_id", userId).maybeSingle();
      const { data: links } = collab?.id
        ? await supabase.from("client_collaborators").select("client_id").eq("collaborator_id", collab.id)
        : { data: [] as { client_id: string }[] };
      const clientIds = (links ?? []).map((l) => l.client_id);
      if (!clientIds.length) return { clients: 0, openTasks: 0, overdue: 0, recentDocs: [], events: [] };
      const today = new Date().toISOString().slice(0, 10);
      const [openTasks, overdue, recentDocs, events] = await Promise.all([
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).in("client_id", clientIds).not("status", "in", "(concluida,cancelada)"),
        supabase.from("pending_tasks").select("id", { head: true, count: "exact" }).in("client_id", clientIds).lt("prazo", today).not("status", "in", "(concluida,cancelada)"),
        supabase.from("documents").select("id, nome, status, client_id, clients(razao_social)").in("client_id", clientIds).order("created_at", { ascending: false }).limit(5),
        supabase.from("timeline_events").select("id, descricao, created_at, clients(razao_social)").in("client_id", clientIds).order("created_at", { ascending: false }).limit(6),
      ]);
      return {
        clients: clientIds.length,
        openTasks: openTasks.count ?? 0, overdue: overdue.count ?? 0,
        recentDocs: recentDocs.data ?? [], events: events.data ?? [],
      };
    },
  });

  return (
    <div>
      <PageHeader title={`Olá, ${name?.split(" ")[0] || "colaborador"}`} description="Sua operação com os clientes vinculados." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Clientes vinculados" value={data?.clients ?? "—"} />
        <StatCard icon={ClipboardList} label="Pendências abertas" value={data?.openTasks ?? "—"} accent="bg-info/10 text-info" />
        <StatCard icon={AlertTriangle} label="Vencidas" value={data?.overdue ?? "—"} accent="bg-destructive/10 text-destructive" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Documentos recentes</h3>
          {(!data?.recentDocs?.length) ? <p className="text-sm text-muted-foreground">Nada por aqui.</p> : (
            <ul className="divide-y">
              {data!.recentDocs.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">{d.clients?.razao_social}</div>
                  </div>
                  <StatusBadge value={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 font-display text-lg">Últimas interações</h3>
          {(!data?.events?.length) ? <p className="text-sm text-muted-foreground">Nada por aqui.</p> : (
            <ul className="space-y-3">
              {data!.events.map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                  <div className="min-w-0">
                    <div className="text-sm">{e.descricao}</div>
                    <div className="text-xs text-muted-foreground">{e.clients?.razao_social}</div>
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

function ClientDashboard({ name, userId }: { name: string; userId: string }) {
  const { data } = useQuery({
    queryKey: ["dash-client", userId],
    queryFn: async () => {
      const { data: cs } = await supabase.from("clients").select("id, razao_social").eq("owner_profile_id", userId);
      const ids = (cs ?? []).map((c) => c.id);
      if (!ids.length) return { tasks: [], docs: [], events: [] };
      const [tasks, docs, events] = await Promise.all([
        supabase.from("pending_tasks").select("*").in("client_id", ids).not("status", "in", "(concluida,cancelada)").order("prazo", { ascending: true }).limit(5),
        supabase.from("documents").select("id, nome, status, tipo, created_at").in("client_id", ids).order("created_at", { ascending: false }).limit(5),
        supabase.from("timeline_events").select("id, descricao, created_at").in("client_id", ids).order("created_at", { ascending: false }).limit(6),
      ]);
      return { tasks: tasks.data ?? [], docs: docs.data ?? [], events: events.data ?? [] };
    },
  });

  return (
    <div>
      <PageHeader title={`Olá, ${name?.split(" ")[0] || "cliente"}`} description="Sua área SC Central." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /><h3 className="font-display text-lg">Pendências abertas</h3></div>
          {(!data?.tasks?.length) ? <p className="text-sm text-muted-foreground">Nenhuma pendência. 🎉</p> : (
            <ul className="space-y-2">
              {data!.tasks.map((t: any) => (
                <li key={t.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{t.titulo}</div>
                    <StatusBadge value={t.status} />
                  </div>
                  {t.prazo && <div className="mt-1 text-xs text-muted-foreground">Prazo: {new Date(t.prazo).toLocaleDateString("pt-BR")}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h3 className="font-display text-lg">Meus documentos</h3></div>
          {(!data?.docs?.length) ? <p className="text-sm text-muted-foreground">Nada enviado ainda.</p> : (
            <ul className="divide-y">
              {data!.docs.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <div className="text-sm">{d.nome}</div>
                  <StatusBadge value={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /><h3 className="font-display text-lg">Histórico</h3></div>
          {(!data?.events?.length) ? <p className="text-sm text-muted-foreground">Sem histórico.</p> : (
            <ul className="space-y-3">
              {data!.events.map((e: any) => (
                <li key={e.id} className="text-sm">
                  <div>{e.descricao}</div>
                  <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
