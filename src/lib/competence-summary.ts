// Fase B3 — helper PURO de agregação das linhas de get_competence_overview.
//
// Não calcula percentual próprio, não reproduz a cascata de situação: apenas
// agrupa o que `computeSituacao` já decide. Nada aqui toca banco, rede ou React.

import {
  computeSituacao,
  type CompetenceOverviewRow,
  type Situacao,
} from "@/lib/competence-progress";

/**
 * Ordem de atenção operacional do Dashboard (Fase B3).
 * Centralizada aqui para não existir em mais de um arquivo.
 */
export const ATTENTION_ORDER: Record<Situacao, number> = {
  com_atrasos: 0,
  aguardando_cliente: 1,
  sem_atividade: 2,
  em_andamento: 3,
  pronta_revisao: 4,
};

export type CompetenceSummaryItem = {
  client_id: string;
  razao_social: string;
  situacao: Situacao;
};

export type CompetenceSummary = {
  /** Total de competências do mês no conjunto autorizado (Real). */
  total: number;
  /** Contagem por situação canônica. */
  bySituacao: Record<Situacao, number>;
  /** Soma de proc_atrasados — vem exclusivamente do overview. */
  procAtrasados: number;
  /** Empresas com doc_total === 0 na competência. */
  semDocumentos: CompetenceSummaryItem[];
  /** Linhas ordenadas por prioridade de atenção (exclui pronta_revisao). */
  atencao: CompetenceSummaryItem[];
};

const EMPTY_BY_SITUACAO = (): Record<Situacao, number> => ({
  sem_atividade: 0,
  com_atrasos: 0,
  aguardando_cliente: 0,
  pronta_revisao: 0,
  em_andamento: 0,
});

/**
 * Agrupa as linhas do overview para o Dashboard.
 *
 * `includeDemo` é falso por padrão: o Dashboard operacional é Real.
 * Empresas inativas e excluídas já não são devolvidas pela RPC.
 */
export function summarizeCompetenceOverview(
  rows: CompetenceOverviewRow[] | null | undefined,
  opts: { includeDemo?: boolean } = {},
): CompetenceSummary {
  const includeDemo = opts.includeDemo === true;
  const source = (rows ?? []).filter((r) => (includeDemo ? true : !r.is_demo));

  const bySituacao = EMPTY_BY_SITUACAO();
  const semDocumentos: CompetenceSummaryItem[] = [];
  const atencao: CompetenceSummaryItem[] = [];
  let procAtrasados = 0;

  for (const r of source) {
    const situacao = computeSituacao(r);
    bySituacao[situacao] += 1;
    procAtrasados += Number(r.proc_atrasados ?? 0) || 0;
    const item: CompetenceSummaryItem = {
      client_id: r.client_id,
      razao_social: r.razao_social,
      situacao,
    };
    if ((Number(r.doc_total ?? 0) || 0) === 0) semDocumentos.push(item);
    if (situacao !== "pronta_revisao") atencao.push(item);
  }

  atencao.sort((a, b) => {
    const o = ATTENTION_ORDER[a.situacao] - ATTENTION_ORDER[b.situacao];
    return o !== 0 ? o : a.razao_social.localeCompare(b.razao_social);
  });

  return { total: source.length, bySituacao, procAtrasados, semDocumentos, atencao };
}
