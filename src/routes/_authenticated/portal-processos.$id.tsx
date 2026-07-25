import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/sc/EmptyState";
import { Workflow, ArrowLeft, CheckCircle2, Clock, AlertCircle, ExternalLink, FileText } from "lucide-react";
import { formatBR } from "@/lib/dates";
import {
  getProcessStatusLabel,
  getProcessStatusTone,
  getStepStatusLabel,
  getStepStatusTone,
  getRequestStatusLabel,
  getRequestStatusTone,
} from "@/lib/processos-constants";
import { getTimelineLabel } from "@/lib/processo-timeline-labels";

export const Route = createFileRoute("/_authenticated/portal-processos/$id")({
  component: ClientProcessoDetail,
  errorComponent: () => <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo indisponível" description="Verifique o link ou volte para a lista." />,
  notFoundComponent: () => <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo não encontrado" />,
});

function ClientProcessoDetail() {
  const { id } = useParams({ from: "/_authenticated/portal-processos/$id" });
  const navigate = useNavigate();

  const detailQ = useQuery({
    queryKey: ["client-process-detail", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("client_process_detail", { _id: id });
      if (error) throw error;
      return data as any;
    },
  });
  const timelineQ = useQuery({
    queryKey: ["client-process-timeline", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("client_process_timeline", { _id: id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (detailQ.isLoading) return <Card className="h-40 animate-pulse p-4" />;
  if (detailQ.error || !detailQ.data) {
    return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo indisponível"
      description="Você não tem acesso a este processo ou ele foi removido." />;
  }

  const d = detailQ.data as any;
  const proc = d.processo ?? {};
  const etapas: any[] = d.etapas ?? [];
  const solicitacoes: any[] = d.solicitacoes ?? [];

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate({ to: "/portal-processos" })}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Button>
      <PageHeader
        title={d.tipo_nome ?? "Processo"}
        description={`Empresa: ${d.empresa}`}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={getProcessStatusTone(proc.status, "client")}>
            {getProcessStatusLabel(proc.status, "client")}
          </Badge>
          {proc.created_at && <span className="text-xs text-muted-foreground">Aberto em {formatBR(proc.created_at)}</span>}
          {proc.prazo_final && <span className="text-xs text-muted-foreground">· Previsão {formatBR(proc.prazo_final)}</span>}
        </div>
        {proc.status === "aguardando_cliente" && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Aguardando sua ação</div>
            <div className="mt-1 text-xs">{proc.motivo_espera ?? "Verifique as solicitações de documentos abaixo."}</div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium">Etapas</h2>
            {etapas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma etapa pública neste processo.</p>
            ) : (
              <ol className="space-y-2">
                {etapas.map((e: any) => (
                  <li key={e.id} className="rounded border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.status === "concluida" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-xs text-muted-foreground">Etapa {e.ordem}</span>
                      <span className="text-sm font-medium">{e.nome}</span>
                      <Badge className={getStepStatusTone(e.status, "client")}>
                        {getStepStatusLabel(e.status, "client")}
                      </Badge>
                      {e.prazo && e.status !== "concluida" && (
                        <span className="text-[11px] text-muted-foreground">Prazo {formatBR(e.prazo)}</span>
                      )}
                    </div>
                    {e.descricao && <p className="mt-1 text-xs text-muted-foreground">{e.descricao}</p>}
                    {e.observacao && <p className="mt-1 text-xs italic text-muted-foreground">{e.observacao}</p>}
                    {(e.requisitos ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {e.requisitos.map((r: any) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-xs">
                            {r.atendido ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
                            <span className={r.obrigatorio ? "font-medium" : ""}>{r.nome}</span>
                            {r.obrigatorio && <Badge variant="secondary" className="text-[10px]">Obrigatório</Badge>}
                            {r.solicitacao ? (
                              <>
                                <Badge className="bg-amber-100 text-amber-800">
                                  Solicitação: {getRequestStatusLabel(r.solicitacao.status, "client")}
                                  {r.solicitacao.prazo ? ` · prazo ${formatBR(r.solicitacao.prazo)}` : ""}
                                </Badge>
                                <Button asChild size="sm" variant="outline" className="ml-auto h-7">
                                  <Link to="/solicitacoes"><ExternalLink className="mr-1 h-3 w-3" /> Abrir solicitação</Link>
                                </Button>
                              </>
                            ) : r.atendido ? (
                              <span className="ml-auto text-[11px] text-emerald-700">Recebido</span>
                            ) : (
                              <span className="ml-auto text-[11px] text-muted-foreground">Aguardando envio</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Solicitações de documentos
            </h2>
            {solicitacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma solicitação vinculada a este processo.</p>
            ) : (
              <ul className="space-y-2">
                {solicitacoes.map((s: any) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
                    <span className="font-medium">{s.titulo}</span>
                    <Badge className={getRequestStatusTone(s.status)}>
                      {getRequestStatusLabel(s.status, "client")}
                    </Badge>
                    {s.prazo && <span className="text-[11px] text-muted-foreground">Prazo {formatBR(s.prazo)}</span>}
                    <Button asChild size="sm" variant="outline" className="ml-auto h-7">
                      <Link to="/solicitacoes"><ExternalLink className="mr-1 h-3 w-3" /> Abrir</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit p-4">
          <h2 className="mb-3 text-sm font-medium">Andamentos</h2>
          {timelineQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
            : (timelineQ.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Sem andamentos ainda.</p>
            : (
              <ul className="space-y-2">
                {(timelineQ.data ?? []).map((t: any) => (
                  <li key={t.id} className="rounded border p-2 text-xs">
                    <div className="text-muted-foreground">{formatBR(t.created_at)}</div>
                    <div>{getTimelineLabel(t, "client")}</div>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </div>
  );
}

