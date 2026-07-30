// Fase B2 — fonte única do cálculo de progresso e da situação operacional
// da competência para a equipe. Antes esta lógica vivia duplicada nas rotas
// /competencias e /competencias/$clientId/$competence.
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
  doc_total: number;
  guias_total: number;
  guias_vencidas: number;
  guias_proximas: number;
  guias_com_comprovante: number;
  guias_sem_comprovante: number;
  proc_ativos: number;
  proc_atrasados: number;
  proc_concluidos: number;
  proc_aguardando_cliente: number;
};

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

// Progresso por módulo aplicável (0-1) + peso. Módulo sem itens aplicáveis é
// removido do cálculo e seu peso é redistribuído proporcionalmente.
export function computeProgress(
  r: CompetenceOverviewRow,
): { percent: number; applicable: string[] } {
  const modules: { key: string; weight: number; value: number | null }[] = [
    {
      key: "Checklist",
      weight: 40,
      value: (() => {
        const aplicaveis = r.checklist_total - r.checklist_cancelado;
        if (aplicaveis <= 0) return null;
        // "recebido" = documento enviado, aguardando conclusão da contabilidade
        // — NÃO conta como concluído.
        return Math.max(0, Math.min(1, r.checklist_concluido / aplicaveis));
      })(),
    },
    {
      key: "Solicitações",
      weight: 20,
      value: r.sol_total <= 0 ? null : Math.max(0, Math.min(1, r.sol_concluidas / r.sol_total)),
    },
    {
      key: "Guias",
      weight: 20,
      value:
        r.guias_total <= 0
          ? null
          : Math.max(0, Math.min(1, r.guias_com_comprovante / r.guias_total)),
    },
    {
      key: "Pendências",
      weight: 10,
      value: (() => {
        const universo = r.pend_abertas + r.pend_concluidas;
        if (universo <= 0) return null;
        return Math.max(0, Math.min(1, r.pend_concluidas / universo));
      })(),
    },
    {
      key: "Processos",
      weight: 10,
      value: (() => {
        const universo = r.proc_ativos + r.proc_concluidos;
        if (universo <= 0) return null;
        return Math.max(0, Math.min(1, r.proc_concluidos / universo));
      })(),
    },
  ];
  const aplicaveis = modules.filter((m) => m.value !== null);
  if (aplicaveis.length === 0) return { percent: 0, applicable: [] };
  const totalWeight = aplicaveis.reduce((a, m) => a + m.weight, 0);
  const sum = aplicaveis.reduce((a, m) => a + (m.value as number) * m.weight, 0);
  return {
    percent: Math.round((sum / totalWeight) * 100),
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

// Vocabulário canônico de status de guias (mesmo usado nas RPCs do portal).
export const TAX_GUIDE_CLOSED_STATUSES = ["pago", "baixado", "cancelado"] as const;
export const TAX_GUIDE_CLOSED_STATUSES_PG = "(pago,baixado,cancelado)";
