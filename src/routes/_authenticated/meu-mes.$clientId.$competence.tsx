import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/sc/EmptyState";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { formatCompetenciaLong, isValidCompetencia } from "@/lib/competencia";
import { formatBR } from "@/lib/dates";
import { clientStatusLabel, clientStatusTone, clientRequestLabel, clientTimelineLabel } from "@/lib/competence-client-labels";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, FileText, History, Inbox,
  Receipt, Workflow, CalendarClock, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/meu-mes/$clientId/$competence")({
  component: MyMonthDetailPage,
  errorComponent: () => (
    <EmptyState
      icon={<AlertTriangle className="h-6 w-6" />}
      title="Não foi possível carregar as informações da competência"
      description="Tente novamente em instantes."
    />
  ),
});

type PortalData = {
  client_id: string;
  empresa: string;
  competence: string;
  has_competence: boolean;
  status: string | null;
  progresso: number;
  updated_at: string | null;
  reopened: boolean;
  o_que_foi_feito: Array<{ tipo: string; titulo: string; data: string | null }>;
  precisamos_de_voce: Array<{ tipo: string; id: string; titulo: string; prazo: string | null; situacao: string }>;
  solicitacoes: {
    aguardando_envio: Array<{ id: string; titulo: string; prazo: string | null }>;
    reenviar: Array<{ id: string; titulo: string; prazo: string | null }>;
    em_analise: Array<{ id: string; titulo: string }>;
    concluidas: Array<{ id: string; titulo: string }>;
  };
  guias: Array<{
    id: string; tipo: string; competencia: string | null; vencimento: string | null;
    status: string; tem_comprovante: boolean; vencida: boolean;
  }>;
  processos: Array<{
    id: string; tipo: string | null; status: string;
    progresso_total: number; progresso_concluido: number;
    prazo: string | null; updated_at: string;
  }>;
  documentos: {
    escritorio: Array<{ id: string; nome: string; tipo: string; data: string }>;
    cliente: Array<{ id: string; nome: string; tipo: string; data: string }>;
  };
  timeline: Array<{ id: string; tipo: string; descricao: string; created_at: string }>;
};

function MyMonthDetailPage() {
  const { clientId, competence } = Route.useParams();
  const { role, loading } = useCurrentUser();
  const isClient = role === "client";
  const ready = !loading && isClient && isValidCompetencia(competence);

  const q = useQuery({
    queryKey: ["portal-competence-detail", clientId, competence],
    enabled: ready,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_client_competence_portal", {
        p_client_id: clientId,
        p_competence: competence,
      });
      if (error) throw error;
      return data as PortalData;
    },
  });

  if (!loading && !isClient) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-6 w-6" />}
        title="Área do cliente"
        description="Esta página é destinada aos clientes da Spolaor."
      />
    );
  }

  if (!isValidCompetencia(competence)) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-6 w-6" />}
        title="Competência inválida"
        description="Volte para Meu mês e selecione uma competência válida."
      />
    );
  }

  const d = q.data;

  return (
    <div>
      <div className="mb-3">
        <Button asChild size="sm" variant="ghost">
          <Link to="/meu-mes"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <PageHeader
        title={d ? `${d.empresa}` : "Competência"}
        description={formatCompetenciaLong(competence)}
      />

      {q.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>
      ) : !d ? (
        <Card className="p-6 text-sm text-muted-foreground">Sem dados.</Card>
      ) : (
        <>
          {/* Resumo */}
          <Card className="p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <Badge className={clientStatusTone(d.status)}>{clientStatusLabel(d.status)}</Badge>
                {d.reopened && (
                  <span className="ml-2 text-xs text-orange-700">
                    Esta competência foi reaberta para ajustes.
                  </span>
                )}
                {!d.has_competence && (
                  <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    Esta competência ainda não foi iniciada pelo escritório.
                  </div>
                )}
              </div>
              <div className="min-w-[240px]">
                <div className="text-xs text-muted-foreground">Progresso</div>
                <div className="mt-1 flex items-center gap-3">
                  <Progress value={d.progresso} className="h-3 flex-1" />
                  <div className="text-lg font-semibold">{d.progresso}%</div>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  O progresso é uma estimativa com base nas atividades aplicáveis deste mês.
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {d.updated_at
                    ? `Última atualização ${formatDistanceToNow(new Date(d.updated_at), { addSuffix: true, locale: ptBR })}`
                    : "Sem atualização registrada"}
                </div>
              </div>
            </div>
          </Card>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Precisamos de você */}
            <Card className="p-5">
              <SectionHeader icon={<Inbox className="h-4 w-4" />} title="Precisamos de você" />
              {d.precisamos_de_voce.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Você não possui nenhuma ação pendente neste mês.
                </div>
              ) : (
                <ul className="divide-y">
                  {d.precisamos_de_voce.map((it) => (
                    <li key={`${it.tipo}-${it.id}`} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{it.titulo}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          {it.prazo && <span>Prazo: {formatBR(it.prazo)}</span>}
                          <Badge variant="outline" className="text-[10px]">{clientRequestLabel(it.situacao)}</Badge>
                        </div>
                      </div>
                      {it.tipo === "guia_comprovante" ? (
                        <Button asChild size="sm">
                          <Link to="/guias" search={{ client: clientId, comp: competence } as any}>Enviar comprovante</Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm">
                          <Link to="/solicitacoes" search={{ client: clientId, comp: competence } as any}>Abrir</Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* O que já foi feito */}
            <Card className="p-5">
              <SectionHeader icon={<CheckCircle2 className="h-4 w-4" />} title="O que já foi feito" />
              {d.o_que_foi_feito.length === 0 ? (
                <div className="text-sm text-muted-foreground">Ainda não há atividades registradas neste mês.</div>
              ) : (
                <ul className="divide-y">
                  {d.o_que_foi_feito.slice(0, 12).map((it, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0 truncate">{it.titulo}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.data ? formatDistanceToNow(new Date(it.data), { addSuffix: true, locale: ptBR }) : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Guias */}
            <Card className="p-5">
              <SectionHeader icon={<Receipt className="h-4 w-4" />} title="Guias disponíveis" />
              {d.guias.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhuma guia disponível para esta competência.</div>
              ) : (
                <ul className="divide-y">
                  {d.guias.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{g.tipo}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {g.vencimento && <>Vencimento: {formatBR(g.vencimento)}</>}
                          {g.tem_comprovante && <span className="ml-2 text-emerald-700">Comprovante enviado</span>}
                          {g.vencida && (
                            <div className="text-orange-700">Esta guia está vencida. Entre em contato com o escritório.</div>
                          )}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/guias" search={{ client: clientId, comp: competence } as any}>Abrir</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Solicitações */}
            <Card className="p-5">
              <SectionHeader icon={<ClipboardList className="h-4 w-4" />} title="Solicitações" />
              <RequestGroup title="Aguardando envio" items={d.solicitacoes.aguardando_envio} clientId={clientId} competence={competence} />
              <RequestGroup title="Reenviar" items={d.solicitacoes.reenviar} clientId={clientId} competence={competence} />
              <RequestGroup title="Em análise" items={d.solicitacoes.em_analise} clientId={clientId} competence={competence} />
              <RequestGroup title="Concluídas" items={d.solicitacoes.concluidas} clientId={clientId} competence={competence} muted />
              {d.solicitacoes.aguardando_envio.length + d.solicitacoes.reenviar.length + d.solicitacoes.em_analise.length + d.solicitacoes.concluidas.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhuma solicitação neste mês.</div>
              )}
            </Card>

            {/* Processos */}
            <Card className="p-5">
              <SectionHeader icon={<Workflow className="h-4 w-4" />} title="Processos" />
              {d.processos.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum processo em acompanhamento neste mês.</div>
              ) : (
                <ul className="divide-y">
                  {d.processos.map((p) => (
                    <li key={p.id} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.tipo ?? "Processo"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {p.prazo && <>Prazo: {formatBR(p.prazo)} · </>}
                            {p.progresso_concluido}/{p.progresso_total} etapas
                          </div>
                        </div>
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/portal-processos/$id" params={{ id: p.id }}>Ver processo</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Documentos */}
            <Card className="p-5">
              <SectionHeader icon={<FileText className="h-4 w-4" />} title="Documentos" />
              <DocGroup title="Enviados pelo escritório" items={d.documentos.escritorio} />
              <DocGroup title="Enviados por você" items={d.documentos.cliente} />
              {d.documentos.escritorio.length === 0 && d.documentos.cliente.length === 0 && (
                <div className="text-sm text-muted-foreground">Nenhum documento relacionado a esta competência.</div>
              )}
              <div className="mt-3 text-right">
                <Button asChild size="sm" variant="secondary">
                  <Link to="/meus-documentos" search={{ client: clientId, comp: competence } as any}>
                    Ver todos <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>

          {/* Timeline pública */}
          <Card className="mt-6 p-5">
            <SectionHeader icon={<History className="h-4 w-4" />} title="Histórico recente" />
            {d.timeline.length === 0 ? (
              <div className="text-sm text-muted-foreground">Ainda não há movimentação registrada neste mês.</div>
            ) : (
              <ul className="divide-y">
                {d.timeline.slice(0, 20).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{clientTimelineLabel(t.tipo)}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.descricao}</div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-muted-foreground">
      {icon}
      <div className="font-medium text-foreground">{title}</div>
    </div>
  );
}

function RequestGroup({
  title, items, clientId, competence, muted = false,
}: {
  title: string;
  items: Array<{ id: string; titulo: string; prazo?: string | null }>;
  clientId: string;
  competence: string;
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className={`mb-1 text-xs uppercase tracking-wide ${muted ? "text-muted-foreground" : "text-foreground/80"}`}>
        {title} ({items.length})
      </div>
      <ul className="divide-y">
        {items.slice(0, 6).map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <div className="min-w-0 truncate">{it.titulo}</div>
            {("prazo" in it && it.prazo) && (
              <span className="shrink-0 text-xs text-muted-foreground">{formatBR(it.prazo as string)}</span>
            )}
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <div className="mt-1 text-right">
          <Button asChild size="sm" variant="ghost">
            <Link to="/solicitacoes" search={{ client: clientId, comp: competence } as any}>
              Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function DocGroup({ title, items }: { title: string; items: Array<{ id: string; nome: string; tipo: string; data: string }> }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <ul className="divide-y">
        {items.slice(0, 6).map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <div className="min-w-0">
              <div className="truncate">{it.nome}</div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(it.data), { addSuffix: true, locale: ptBR })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
