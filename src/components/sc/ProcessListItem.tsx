/**
 * Item de lista de processos compartilhado entre staff e portal.
 *
 * Preserva exatamente a marcação anterior de cada tela — o componente apenas
 * seleciona o layout apropriado a partir de `audience`. Não adiciona ou remove
 * dados exibidos: cada tela continua responsável por decidir se passa
 * `prioridade`, `responsavelNome`, `aguardandoAcao` etc.
 */

import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ArrowRight } from "lucide-react";
import {
  getProcessStatusLabel,
  getProcessStatusTone,
  getPriorityLabel,
  getPriorityTone,
  isProcessOpen,
  type Audience,
} from "@/lib/processos-constants";
import { prazoKind, PRAZO_STYLE } from "@/lib/processo-prazo";

export type ProcessListItemProps = {
  audience: Audience;
  /** id do processo — usado para navegação */
  processId: string;
  /** nome/label da empresa (staff) ou nome do cliente (portal) */
  empresa: string;
  /** nome do tipo do processo */
  tipoNome?: string | null;
  /** cor do tipo (círculo colorido no staff) */
  tipoCor?: string | null;
  /** status técnico do processo */
  status: string;
  /** prioridade técnica — usada apenas no staff */
  prioridade?: string | null;
  /** nome do responsável — usado apenas no staff */
  responsavelNome?: string | null;
  /** prazo final do processo (data ISO) */
  prazoFinal?: string | null;
  /** data de abertura (usada apenas no portal) */
  dataAbertura?: string | null;
  /** total de etapas do processo */
  totalEtapas?: number | null;
  /** etapas concluídas */
  etapasConcluidas?: number | null;
  /** progresso (0-100) */
  progresso?: number | null;
  /** flag: cliente tem ação pendente — mostra badge amber no portal */
  aguardandoAcao?: boolean;
};

const formatBR = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "");

export function ProcessListItem(props: ProcessListItemProps) {
  if (props.audience === "client") return <ClientProcessCard {...props} />;
  return <StaffProcessRow {...props} />;
}

function StaffProcessRow(p: ProcessListItemProps) {
  const total = p.totalEtapas ?? 0;
  const done = p.etapasConcluidas ?? 0;
  const pct = p.progresso ?? 0;
  const statusLabel = getProcessStatusLabel(p.status, "staff");
  const statusTone = getProcessStatusTone(p.status, "staff");
  const prioLabel = p.prioridade ? getPriorityLabel(p.prioridade) : null;
  const prioTone = p.prioridade ? getPriorityTone(p.prioridade) : null;
  const isOpen = isProcessOpen(p.status);
  const pk = isOpen ? prazoKind(p.prazoFinal ?? null) : null;
  const pkBadge = pk && (pk === "vencido" || pk === "hoje" || pk === "em_breve") ? PRAZO_STYLE[pk] : null;

  return (
    <Link to="/processos/$id" params={{ id: p.processId }} search={{ client: undefined }} className="block p-3 hover:bg-muted/40">
      <div className="flex flex-wrap items-center gap-2">
        {p.tipoCor && <span className="h-3 w-3 rounded-full border" style={{ background: p.tipoCor }} />}
        <span className="font-medium">{p.empresa}</span>
        {p.tipoNome && <Badge variant="outline">{p.tipoNome}</Badge>}
        <Badge className={statusTone}>{statusLabel}</Badge>
        {prioLabel && prioTone && <Badge className={prioTone}>{prioLabel}</Badge>}
        {pkBadge && <Badge className={pkBadge.cls}>{pkBadge.label}</Badge>}
        {p.responsavelNome && <span className="text-xs text-muted-foreground">· {p.responsavelNome}</span>}
        {p.prazoFinal && <span className="text-xs text-muted-foreground">· prazo {formatBR(p.prazoFinal)}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{done}/{total} etapas</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Progress value={pct} className="h-1.5" />
        <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
      </div>
    </Link>
  );
}

function ClientProcessCard(p: ProcessListItemProps) {
  const total = p.totalEtapas ?? 0;
  const done = p.etapasConcluidas ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const statusLabel = getProcessStatusLabel(p.status, "client");
  const statusTone = getProcessStatusTone(p.status, "client");

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.tipoNome ?? "Processo"}</span>
            <Badge className={statusTone}>{statusLabel}</Badge>
            {p.aguardandoAcao && (
              <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Aguardando sua ação
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Empresa: {p.empresa}
            {p.dataAbertura ? ` · Aberto em ${formatBR(p.dataAbertura)}` : ""}
            {p.prazoFinal ? ` · Previsão ${formatBR(p.prazoFinal)}` : ""}
          </div>
          {total > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Progresso</span><span>{done}/{total} etapas</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
        <Button asChild size="sm">
          <Link to="/portal-processos/$id" params={{ id: p.processId }}>
            Abrir <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
