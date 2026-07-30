import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/sc/EmptyState";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import { formatCompetenciaLong, isValidCompetencia, competenciaBounds } from "@/lib/competencia";
import { formatBR } from "@/lib/dates";
import { computeProgress, computeSituacao, progressInputsFromOverview, type CompetenceOverviewRow } from "@/lib/competence-progress";
import { CompetenceCyclePanel } from "@/components/sc/CompetenceCyclePanel";
import {
  Layers, AlertTriangle, ClipboardList, ListChecks, Inbox, FileText, Receipt, Workflow,
  ArrowLeft, ArrowRight, Info, History,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/competencias_/$clientId/$competence")({
  component: CompetenciaDetailPage,
  errorComponent: () => (
    <EmptyState
      icon={<Layers className="h-6 w-6" />}
      title="Não foi possível carregar a competência"
      description="Tente novamente."
    />
  ),
});

type OverviewRow = CompetenceOverviewRow;

function CompetenciaDetailPage() {
  const { clientId, competence } = Route.useParams();
  const { role, loading, userId } = useCurrentUser();
  const router = useRouter();

  const isStaff = role === "admin" || role === "collaborator";
  const ready = !loading && isStaff && isValidCompetencia(competence);

  const overviewQuery = useQuery({
    queryKey: ["competence-overview-detail", competence, clientId],
    enabled: ready,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_competence_overview", {
        p_competence: competence,
      });
      if (error) throw error;
      const rows = (data ?? []) as OverviewRow[];
      return rows.find((r) => r.client_id === clientId) ?? null;
    },
  });

  const timelineQuery = useQuery({
    queryKey: ["competence-timeline", clientId, competence],
    enabled: ready,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { start, endExclusive } = competenciaBounds(competence);
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id, tipo, descricao, created_at")
        .eq("client_id", clientId)
        .gte("created_at", start)
        .lt("created_at", endExclusive)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!isStaff) {
    return <EmptyState icon={<Layers className="h-6 w-6" />} title="Acesso restrito" />;
  }
  if (!isValidCompetencia(competence)) {
    return <EmptyState icon={<Layers className="h-6 w-6" />} title="Competência inválida" description="Formato esperado: AAAA-MM." />;
  }
  if (overviewQuery.isLoading) return <p className="text-sm text-muted-foreground">Carregando competência…</p>;
  if (overviewQuery.isError) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title="Não foi possível carregar a competência"
        description="Tente novamente."
      />
    );
  }
  const r = overviewQuery.data;
  if (!r) {
    return (
      <div>
        <div className="mb-3">
          <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/competencias", search: { comp: undefined } })}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar
          </Button>
        </div>
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Empresa não acessível ou sem dados nesta competência"
          description="Verifique o vínculo ou selecione outra competência."
        />
      </div>
    );
  }

  const { percent, applicable } = computeProgress(progressInputsFromOverview(r));
  const situacao = computeSituacao(r);

  const alerts: string[] = [];
  if (r.pend_vencidas > 0) alerts.push(`${r.pend_vencidas} pendência(s) vencida(s)`);
  if (r.guias_vencidas > 0) alerts.push(`${r.guias_vencidas} guia(s) vencida(s)`);
  if (r.proc_atrasados > 0) alerts.push(`${r.proc_atrasados} processo(s) atrasado(s)`);
  if (r.sol_aguardando_cliente > 0) alerts.push(`${r.sol_aguardando_cliente} solicitação(ões) aguardando cliente`);

  const checklistAplic = Math.max(0, r.checklist_total - r.checklist_cancelado);
  // "recebido" = aguardando conclusão da contabilidade — não conta como concluído.
  const checklistFeito = r.checklist_concluido;

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/competencias", search: { comp: competence } as any })}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar para Competências
        </Button>
      </div>

      <PageHeader
        title={clientLabel({ razao_social: r.razao_social, nome_fantasia: r.nome_fantasia, documento: null })}
        description={`Competência: ${formatCompetenciaLong(competence)}`}
      />

      {/* Resumo */}
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Progresso</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{percent}%</span>
            <Badge>{situacao === "com_atrasos" ? "Com atrasos" :
              situacao === "aguardando_cliente" ? "Aguardando cliente" :
              situacao === "pronta_revisao" ? "Pronta para revisão" :
              situacao === "sem_atividade" ? "Sem atividade" : "Em andamento"}</Badge>
          </div>
          <Progress value={percent} className="mt-2 h-2" />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3" />
            O progresso é calculado com base nos itens aplicáveis desta competência.
            {applicable.length > 0 && <span className="ml-1">Módulos considerados: {applicable.join(", ")}.</span>}
          </p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Responsável</div>
          <div className="mt-1 text-base font-medium">{r.responsavel_nome ?? "—"}</div>
          <div className="mt-3 text-xs uppercase text-muted-foreground">Origem</div>
          <div className="mt-1 text-sm">{r.is_demo ? "Empresa demo" : "Empresa real"}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Alertas
          </div>
          {alerts.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">Nenhum alerta.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {alerts.map((a, i) => <li key={i} className="text-red-700">• {a}</li>)}
            </ul>
          )}
        </Card>
      </div>

      {/* O que precisa de atenção */}
      {(r.pend_vencidas > 0 || r.guias_vencidas > 0 || r.proc_atrasados > 0 || r.sol_aguardando_cliente > 0) && (
        <Card className="mb-3 border-red-200 bg-red-50/40 p-4">
          <h3 className="mb-2 font-display text-base">O que precisa de atenção</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {r.pend_vencidas > 0 && (
              <ShortcutLink to="/pendencias" params={{ client: clientId }}
                label={`${r.pend_vencidas} pendência(s) vencida(s)`} icon={<ClipboardList className="h-4 w-4" />} tone="danger" />
            )}
            {r.guias_vencidas > 0 && (
              <ShortcutLink to="/guias" params={{ client: clientId, comp: competence }}
                label={`${r.guias_vencidas} guia(s) vencida(s)`} icon={<Receipt className="h-4 w-4" />} tone="danger" />
            )}
            {r.proc_atrasados > 0 && (
              <ShortcutLink to="/processos" params={{ client: clientId }}
                label={`${r.proc_atrasados} processo(s) atrasado(s)`} icon={<Workflow className="h-4 w-4" />} tone="danger" />
            )}
            {r.sol_aguardando_cliente > 0 && (
              <ShortcutLink to="/documentos" params={{ tab: "aguardando_cliente", client: clientId, comp: competence }}
                label={`${r.sol_aguardando_cliente} solicitação(ões) aguardando cliente`} icon={<Inbox className="h-4 w-4" />} tone="warn" />
            )}
          </div>
        </Card>
      )}

      {/* Ciclo da competência (Fase 2) */}
      <div className="mb-3">
        <CompetenceCyclePanel
          clientId={clientId}
          competence={competence}
          role={role}
          userId={userId}
        />
      </div>

      {/* Cards dos módulos */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <ModuleCard
          title="Checklist"
          icon={<ListChecks className="h-4 w-4" />}
          to="/checklist"
          params={{ client: clientId, comp: competence }}
          stats={[
            { label: "Total", value: r.checklist_total },
            { label: "Concluídos", value: r.checklist_concluido },
            { label: "Recebidos", value: r.checklist_recebido },
            { label: "Pendentes", value: r.checklist_pendente },
            { label: "Cancelados", value: r.checklist_cancelado },
          ]}
          summary={`${checklistFeito} de ${checklistAplic} aplicáveis`}
        />
        <ModuleCard
          title="Pendências"
          icon={<ClipboardList className="h-4 w-4" />}
          to="/pendencias"
          params={{ client: clientId, comp: competence }}
          stats={[
            { label: "Abertas", value: r.pend_abertas },
            { label: "Vencidas", value: r.pend_vencidas, tone: r.pend_vencidas > 0 ? "danger" : undefined },
            { label: "Concluídas no período", value: r.pend_concluidas },
            { label: "Aguardando cliente", value: r.pend_aguardando_cliente },
          ]}
        />
        <ModuleCard
          title="Solicitações"
          icon={<Inbox className="h-4 w-4" />}
          to="/solicitacoes"
          params={{ client: clientId, comp: competence }}
          stats={[
            { label: "Aguardando cliente", value: r.sol_aguardando_cliente },
            { label: "Em análise", value: r.sol_em_analise },
            { label: "Concluídas", value: r.sol_concluidas },
            { label: "Total da competência", value: r.sol_total },
          ]}
        />
        <ModuleCard
          title="Documentos"
          icon={<FileText className="h-4 w-4" />}
          to="/documentos"
          params={{ client: clientId, comp: competence }}
          stats={[
            { label: "No período", value: r.doc_total },
          ]}
          summary="Apenas documentos com competência ou período correspondente."
        />
        <ModuleCard
          title="Guias e impostos"
          icon={<Receipt className="h-4 w-4" />}
          to="/guias"
          params={{ client: clientId, comp: competence }}
          stats={[
            { label: "Total da competência", value: r.guias_total },
            { label: "Vencidas", value: r.guias_vencidas, tone: r.guias_vencidas > 0 ? "danger" : undefined },
            { label: "Próximas do vencimento", value: r.guias_proximas },
            { label: "Com comprovante", value: r.guias_com_comprovante },
            { label: "Sem comprovante", value: r.guias_sem_comprovante },
          ]}
        />
        <ModuleCard
          title="Processos"
          icon={<Workflow className="h-4 w-4" />}
          to="/processos"
          params={{ client: clientId }}
          stats={[
            { label: "Ativos no período", value: r.proc_ativos },
            { label: "Atrasados", value: r.proc_atrasados, tone: r.proc_atrasados > 0 ? "danger" : undefined },
            { label: "Concluídos no período", value: r.proc_concluidos },
            { label: "Aguardando cliente", value: r.proc_aguardando_cliente },
          ]}
          summary="Processos podem atravessar meses — considerados os que estiveram ativos no período."
        />
      </div>

      {/* Atividade recente */}
      <Card className="mt-3 p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display text-base">
          <History className="h-4 w-4" /> Atividade recente
        </h3>
        {timelineQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (timelineQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Esta empresa ainda não possui movimentação nesta competência.
          </p>
        ) : (
          <ul className="divide-y">
            {(timelineQuery.data ?? []).map((ev: any) => (
              <li key={ev.id} className="py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{ev.tipo}</Badge>
                  <span className="truncate">{ev.descricao}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatBR(ev.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ModuleCard({
  title, icon, to, params, stats, summary,
}: {
  title: string;
  icon: React.ReactNode;
  to: "/checklist" | "/pendencias" | "/solicitacoes" | "/documentos" | "/guias" | "/processos";
  params: Record<string, string>;
  stats: { label: string; value: number; tone?: "danger" }[];
  summary?: string;
}) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">{icon}{title}</div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {stats.map((s) => (
          <div key={s.label} className="flex items-baseline justify-between gap-2">
            <dt className="truncate text-muted-foreground">{s.label}</dt>
            <dd className={`font-medium ${s.tone === "danger" ? "text-red-700" : ""}`}>{s.value}</dd>
          </div>
        ))}
      </dl>
      {summary && <p className="mt-2 text-[11px] text-muted-foreground">{summary}</p>}
      <div className="mt-3">
        <Button asChild size="sm" variant="outline">
          <Link to={to} search={params as any}>
            Abrir {title.toLowerCase()} <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function ShortcutLink({
  to, params, label, icon, tone,
}: {
  to: "/pendencias" | "/guias" | "/processos" | "/solicitacoes";
  params: Record<string, string>;
  label: string;
  icon: React.ReactNode;
  tone?: "danger" | "warn";
}) {
  const cls =
    tone === "danger" ? "border-red-200 bg-white text-red-800 hover:bg-red-50" :
    tone === "warn"   ? "border-amber-200 bg-white text-amber-900 hover:bg-amber-50" :
                         "border bg-white hover:bg-muted/50";
  return (
    <Link to={to} search={params as any} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${cls}`}>
      {icon}
      <span className="truncate">{label}</span>
      <ArrowRight className="ml-auto h-3.5 w-3.5" />
    </Link>
  );
}
