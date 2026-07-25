/**
 * Timeline unificada entre área interna (staff) e portal (cliente).
 *
 * Uma única função `getTimelineLabel(event, audience)` retorna o texto exibido.
 * Um único conjunto declara quais eventos são visíveis para cada audiência
 * (portal NÃO expõe tipos internos como responsável/prazo/documentos).
 *
 * Icons são mapeados por tipo para uso na coluna interna; portal não usa ícones
 * por evento (mantém comportamento visual atual).
 */

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  FilePlus2,
  Paperclip,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { PROCESS_STATUS_LOWER, STEP_STATUS_LOWER, isProcessStatus, isStepStatus } from "./processos-constants";

export type Audience = "staff" | "client";

export type TimelineEvent = {
  id?: string | number;
  tipo: string;
  descricao?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
  actor_name?: string | null;
};

/** Tipos visíveis para cada audiência. Tipos ausentes = mascarados. */
export const TIMELINE_VISIBILITY: Record<string, { staff: boolean; client: boolean }> = {
  processo_aberto:                          { staff: true,  client: true  },
  processo_status:                          { staff: true,  client: true  },
  processo_responsavel:                     { staff: true,  client: false },
  processo_prazo:                           { staff: true,  client: false },
  processo_etapa_status:                    { staff: true,  client: false },
  processo_etapa_responsavel:               { staff: true,  client: false },
  processo_etapa_prazo:                     { staff: true,  client: false },
  processo_documento_vinculado:             { staff: true,  client: false },
  processo_etapa_documento_vinculado:       { staff: true,  client: false },
  processo_documento_desvinculado:          { staff: true,  client: false },
  processo_requisito_atendido:              { staff: true,  client: false },
  processo_requisito_substituido:           { staff: true,  client: false },
  processo_requisito_removido:              { staff: true,  client: false },
  // Eventos originados no ciclo de solicitações ao cliente — visíveis no portal.
  processo_solicitacao_criada:              { staff: true,  client: true  },
  processo_solicitacao_cancelada:           { staff: true,  client: true  },
  processo_requisito_atendido_solicitacao:  { staff: true,  client: true  },
};

/** Testa se o evento deve aparecer para a audiência (fallback seguro: mascarar). */
export function isTimelineVisible(tipo: string, audience: Audience): boolean {
  return !!TIMELINE_VISIBILITY[tipo]?.[audience];
}

/** Filtra a lista respeitando visibilidade. */
export function filterVisibleTimeline<T extends TimelineEvent>(events: T[], audience: Audience): T[] {
  return events.filter((e) => isTimelineVisible(e.tipo, audience));
}

const TIMELINE_ICON: Record<string, LucideIcon> = {
  processo_aberto: FilePlus2,
  processo_status: Activity,
  processo_responsavel: UserRound,
  processo_prazo: CalendarClock,
  processo_etapa_status: CheckCircle2,
  processo_etapa_responsavel: UserRound,
  processo_etapa_prazo: CalendarClock,
  processo_documento_vinculado: Paperclip,
  processo_etapa_documento_vinculado: Paperclip,
  processo_documento_desvinculado: Paperclip,
  processo_requisito_atendido: CheckCircle2,
  processo_requisito_substituido: Paperclip,
  processo_requisito_removido: XCircle,
  processo_solicitacao_criada: Paperclip,
  processo_solicitacao_cancelada: XCircle,
  processo_requisito_atendido_solicitacao: CheckCircle2,
};
export function getTimelineIcon(tipo: string): LucideIcon {
  return TIMELINE_ICON[tipo] ?? Activity;
}

const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");

/**
 * Texto amigável para o evento, parametrizado por audiência.
 *
 * Fallback:
 * - staff  → descricao existente ou o próprio tipo (sem mascarar).
 * - client → descricao apenas se o evento for visível ao cliente; caso contrário
 *            string vazia (nunca vaza `tipo` técnico no portal).
 */
export function getTimelineLabel(e: TimelineEvent, audience: Audience = "staff"): string {
  const tipo = e.tipo;
  const descricao = e.descricao ?? "";
  const meta = e.metadata ?? {};

  // Rotula status usando a tabela em minúsculas (staff timeline mantém o tom antigo).
  const oldRaw = meta.old;
  const newRaw = meta.new;
  const oldStatusLower =
    isProcessStatus(oldRaw) ? PROCESS_STATUS_LOWER[oldRaw]
    : isStepStatus(oldRaw)  ? STEP_STATUS_LOWER[oldRaw]
    : (oldRaw ?? undefined);
  const newStatusLower =
    isProcessStatus(newRaw) ? PROCESS_STATUS_LOWER[newRaw]
    : isStepStatus(newRaw)  ? STEP_STATUS_LOWER[newRaw]
    : (newRaw ?? undefined);

  switch (tipo) {
    case "processo_aberto":
      return "Processo aberto.";

    case "processo_status": {
      if (audience === "client") {
        // Portal mantém o comportamento anterior: "Status: <novo>."
        return `Status: ${newStatusLower ?? "atualizado"}.`;
      }
      if (newStatusLower === "aguardando cliente" || newStatusLower === "aguardando órgão") {
        return `Processo em espera (${newStatusLower})${meta.motivo_espera ? `: ${meta.motivo_espera}` : ""}.`;
      }
      if (newStatusLower === "em andamento" && (oldStatusLower === "aguardando cliente" || oldStatusLower === "aguardando órgão")) {
        return "Processo retomado.";
      }
      return `Status → ${newStatusLower ?? "—"}.`;
    }

    case "processo_responsavel":
      if (audience === "client") return ""; // não visível
      return "Responsável do processo alterado.";

    case "processo_prazo":
      if (audience === "client") return "";
      return `Prazo alterado (${fmtDate(meta.old)} → ${fmtDate(meta.new)}).`;

    case "processo_etapa_status": {
      if (audience === "client") return "";
      const stepName = descricao?.match(/"([^"]+)"/)?.[1];
      const nm = stepName ? `"${stepName}"` : "etapa";
      if (newStatusLower === "concluída") return `Etapa ${nm} concluída.`;
      if (oldStatusLower === "concluída" && newStatusLower !== "concluída") return `Etapa ${nm} reaberta.`;
      if (newStatusLower === "em andamento") return `Etapa ${nm} iniciada.`;
      return `Etapa ${nm} → ${newStatusLower ?? "—"}.`;
    }

    case "processo_etapa_responsavel":
      if (audience === "client") return "";
      return descricao || "Responsável de etapa alterado.";

    case "processo_etapa_prazo":
      if (audience === "client") return "";
      return `${descricao} (${fmtDate(meta.old)} → ${fmtDate(meta.new)}).`;

    case "processo_solicitacao_criada":
      return audience === "client"
        ? "Uma solicitação de documento foi enviada a você."
        : (descricao || "Solicitação de documento criada.");

    case "processo_solicitacao_cancelada":
      return audience === "client"
        ? "Uma solicitação vinculada foi cancelada."
        : (descricao || "Solicitação vinculada cancelada.");

    case "processo_requisito_atendido_solicitacao":
      return audience === "client"
        ? "Um documento enviado foi vinculado ao processo."
        : (descricao || "Requisito atendido via solicitação.");

    default:
      if (audience === "client") {
        // segurança: nunca vaza tipo técnico ao cliente
        return isTimelineVisible(tipo, "client") ? (descricao || "") : "";
      }
      return descricao || tipo;
  }
}
