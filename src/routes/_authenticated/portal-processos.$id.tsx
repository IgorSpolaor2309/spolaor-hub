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

export const Route = createFileRoute("/_authenticated/portal-processos/$id")({
  component: ClientProcessoDetail,
  errorComponent: () => <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo indisponível" description="Verifique o link ou volte para a lista." />,
  notFoundComponent: () => <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo não encontrado" />,
});

const STATUS_LABEL: Record<string, string> = {
  nao_iniciado: "Ainda não iniciado", em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando sua ação", aguardando_orgao: "Aguardando análise externa",
  concluido: "Concluído", cancelado: "Cancelado",
  pendente: "Pendente", concluida: "Concluída",
};
const STATUS_TONE: Record<string, string> = {
  nao_iniciado: "bg-zinc-100 text-zinc-700",
  em_andamento: "bg-indigo-100 text-indigo-800",
  aguardando_cliente: "bg-amber-100 text-amber-800",
  aguardando_orgao: "bg-sky-100 text-sky-800",
  concluido: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-zinc-200 text-zinc-700",
  pendente: "bg-amber-100 text-amber-800",
  concluida: "bg-emerald-100 text-emerald-800",
};
const REQ_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", solicitado: "Solicitado", em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando você", reenviar: "Reenviar",
  recebido: "Recebido", concluido: "Concluído", recusado: "Recusado", cancelado: "Cancelado",
};

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
          <Badge className={STATUS_TONE[proc.status] ?? "bg-zinc-100 text-zinc-700"}>
            {STATUS_LABEL[proc.status] ?? proc.status}
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
                      <Badge className={STATUS_TONE[e.status] ?? "bg-zinc-100 text-zinc-700"}>
                        {STATUS_LABEL[e.status] ?? e.status}
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
                                  Solicitação: {REQ_STATUS_LABEL[r.solicitacao.status] ?? r.solicitacao.status}
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
                    <Badge className={STATUS_TONE[s.status] ?? "bg-zinc-100 text-zinc-700"}>
                      {REQ_STATUS_LABEL[s.status] ?? s.status}
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
                    <div>{friendlyEvent(t)}</div>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </div>
  );
}

function friendlyEvent(t: any): string {
  switch (t.tipo) {
    case "processo_aberto": return "Processo aberto.";
    case "processo_status": {
      const s = t.metadata?.new;
      return `Status: ${STATUS_LABEL[s] ?? s ?? "atualizado"}.`;
    }
    case "processo_solicitacao_criada": return "Uma solicitação de documento foi enviada a você.";
    case "processo_solicitacao_cancelada": return "Uma solicitação vinculada foi cancelada.";
    case "processo_requisito_atendido_solicitacao": return "Um documento enviado foi vinculado ao processo.";
    default: return t.descricao ?? "";
  }
}
