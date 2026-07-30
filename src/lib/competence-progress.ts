// Fase B2 — fonte ÚNICA do cálculo de progresso e da situação operacional da
// competência, para equipe E portal do cliente.
//
// Regra: nenhuma RPC calcula percentual. As RPCs devolvem apenas contadores
// (`get_competence_overview` para a equipe, `progress_inputs` no payload de
// `get_client_competence_portal`) e todas as telas chamam `computeProgress`.
//
// Importante: "status" (client_competences) é o estado do fluxo mensal e vive
// em competence-status.ts. "situação" (aqui) é a saúde operacional do mês.

export type CompetenceOverviewRow = {
  client_id: string;
  razao_social: string;
  nome_fantasia: string | null;
  responsavel_nome: string | null;
  is_demo: boolean;
  checklist_total: number;
  checklist_pendente: number;
  checklist_recebido: number;
  checklist_concluido: number;
  checklist_cancelado: number;
  pend_abertas: number;
  pend_vencidas: number;
  pend_concluidas: number;
  pend_aguardando_cliente: number;
  sol_aguardando_cliente: number;
  sol_em_analise: number;
  sol_concluidas: number;
  sol_total: number;
  sol_cancelado: number;
  doc_total: number;
  guias_total: number;
  guias_vencidas: number;
  guias_proximas: number;
  guias_com_comprovante: number;
  guias_sem_comprovante: number;
  guias_cancelado: number;
  guias_concluidas: number;
  proc_ativos: number;
  proc_atrasados: number;
  proc_concluidos: number;
  proc_aguardando_cliente: number;
};

/**
 * Contadores canônicos — única entrada aceita por computeProgress.
 * Somente números: nenhum nome, responsável, observação ou ID interno.
 */
export type CompetenceProgressInputs = {
  chk_total: number;
  chk_cancelado: number;
  chk_concluido: number;
  sol_total: number;
  sol_cancelado: number;
  sol_concluidas: number;
  gui_total: number;
  gui_cancelado: number;
  /** guias resolvidas: pago, baixado ou com comprovante válido (excluídas as canceladas) */
  gui_concluidas: number;
  pend_abertas: number;
  pend_concluidas: number;
  proc_ativos: number;
  proc_concluidos: number;
};

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Adaptador único: linha de get_competence_overview → contadores canônicos. */
export function progressInputsFromOverview(r: CompetenceOverviewRow): CompetenceProgressInputs {
  return {
    chk_total: n(r.checklist_total),
    chk_cancelado: n(r.checklist_cancelado),
    chk_concluido: n(r.checklist_concluido),
    sol_total: n(r.sol_total),
    sol_cancelado: n((r as { sol_cancelado?: number }).sol_cancelado),
    sol_concluidas: n(r.sol_concluidas),
    gui_total: n(r.guias_total),
    gui_cancelado: n((r as { guias_cancelado?: number }).guias_cancelado),
    gui_concluidas: n((r as { guias_concluidas?: number }).guias_concluidas),
    pend_abertas: n(r.pend_abertas),
    pend_concluidas: n(r.pend_concluidas),
    proc_ativos: n(r.proc_ativos),
    proc_concluidos: n(r.proc_concluidos),
  };
}

/** Adaptador único: `progress_inputs` do portal do cliente → contadores canônicos. */
export function progressInputsFromPortal(pi: unknown): CompetenceProgressInputs {
  const p = (pi ?? {}) as Record<string, unknown>;
  return {
    chk_total: n(p.chk_total),
    chk_cancelado: n(p.chk_cancelado),
    chk_concluido: n(p.chk_concluido),
    sol_total: n(p.sol_total),
    sol_cancelado: n(p.sol_cancelado),
    sol_concluidas: n(p.sol_concluidas),
    gui_total: n(p.gui_total),
    gui_cancelado: n(p.gui_cancelado),
    gui_concluidas: n(p.gui_concluidas),
    pend_abertas: n(p.pend_abertas),
    pend_concluidas: n(p.pend_concluidas),
    proc_ativos: n(p.proc_ativos),
    proc_concluidos: n(p.proc_concluidos),
  };
}

export type Situacao =
  | "sem_atividade"
  | "com_atrasos"
  | "aguardando_cliente"
  | "pronta_revisao"
  | "em_andamento";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  sem_atividade: "Sem atividade",
  com_atrasos: "Com atrasos",
  aguardando_cliente: "Aguardando cliente",
  pronta_revisao: "Pronta para revisão",
  em_andamento: "Em andamento",
};

export const MODULE_WEIGHTS = {
  Checklist: 40,
  Solicitações: 20,
  Guias: 20,
  Pendências: 10,
  Processos: 10,
} as const;

const ratio = (done: number, applicable: number): number | null => {
  if (applicable <= 0) return null;
  return Math.max(0, Math.min(1, done / applicable));
};

/**
 * Progresso por módulo aplicável (0-1) + peso 40/20/20/10/10.
 * Módulo sem itens aplicáveis é removido do cálculo e seu peso é
 * redistribuído proporcionalmente entre os módulos restantes.
 * Cancelados (checklist, solicitações, guias, pendências, processos) nunca
 * entram no universo aplicável. Arredondamento final único, clamp 0-100.
 */
export function computeProgress(
  input: CompetenceProgressInputs,
): { percent: number; applicable: string[] } {
  const modules: { key: string; weight: number; value: number | null }[] = [
    {
      key: "Checklist",
      weight: MODULE_WEIGHTS.Checklist,
      // "recebido" = documento enviado, aguardando conclusão da contabilidade
      // — NÃO conta como concluído.
      value: ratio(input.chk_concluido, input.chk_total - input.chk_cancelado),
    },
    {
      key: "Solicitações",
      weight: MODULE_WEIGHTS.Solicitações,
      value: ratio(input.sol_concluidas, input.sol_total - input.sol_cancelado),
    },
    {
      key: "Guias",
      weight: MODULE_WEIGHTS.Guias,
      value: ratio(input.gui_concluidas, input.gui_total - input.gui_cancelado),
    },
    {
      key: "Pendências",
      weight: MODULE_WEIGHTS.Pendências,
      value: ratio(input.pend_concluidas, input.pend_abertas + input.pend_concluidas),
    },
    {
      key: "Processos",
      weight: MODULE_WEIGHTS.Processos,
      value: ratio(input.proc_concluidos, input.proc_ativos + input.proc_concluidos),
    },
  ];
  const aplicaveis = modules.filter((m) => m.value !== null);
  if (aplicaveis.length === 0) return { percent: 0, applicable: [] };
  const totalWeight = aplicaveis.reduce((a, m) => a + m.weight, 0);
  if (totalWeight <= 0) return { percent: 0, applicable: [] };
  const sum = aplicaveis.reduce((a, m) => a + (m.value as number) * m.weight, 0);
  const pct = Math.round((sum / totalWeight) * 100);
  return {
    percent: Math.max(0, Math.min(100, pct)),
    applicable: aplicaveis.map((m) => m.key),
  };
}

export function computeSituacao(r: CompetenceOverviewRow): Situacao {
  const nada =
    r.checklist_total === 0 &&
    r.pend_abertas + r.pend_concluidas === 0 &&
    r.sol_total === 0 &&
    r.doc_total === 0 &&
    r.guias_total === 0 &&
    r.proc_ativos + r.proc_concluidos === 0;
  if (nada) return "sem_atividade";

  const comAtraso = r.pend_vencidas > 0 || r.guias_vencidas > 0 || r.proc_atrasados > 0;
  if (comAtraso) return "com_atrasos";

  const aguardCliente =
    r.sol_aguardando_cliente > 0 ||
    r.pend_aguardando_cliente > 0 ||
    r.proc_aguardando_cliente > 0;
  if (aguardCliente) return "aguardando_cliente";

  const checklistAplic = r.checklist_total - r.checklist_cancelado;
  const checklistFeito = r.checklist_concluido + r.checklist_recebido;
  const checklistOk = checklistAplic === 0 || checklistFeito >= checklistAplic;
  const solOk = r.sol_total === 0 || r.sol_concluidas >= r.sol_total;
  const guiasOk = r.guias_total === 0 || r.guias_com_comprovante >= r.guias_total;
  const pendOk = r.pend_abertas === 0;
  const procOk = r.proc_ativos === 0;
  if (checklistOk && solOk && guiasOk && pendOk && procOk) return "pronta_revisao";

  return "em_andamento";
}

// Vocabulário canônico de status de guias (mesmo usado nas RPCs).
export const TAX_GUIDE_CLOSED_STATUSES = ["pago", "baixado", "cancelado"] as const;
export const TAX_GUIDE_CLOSED_STATUSES_PG = "(pago,baixado,cancelado)";
