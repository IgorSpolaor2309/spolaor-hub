import { describe, it, expect } from "vitest";
import {
  computeProgress,
  progressInputsFromOverview,
  progressInputsFromPortal,
  type CompetenceOverviewRow,
  type CompetenceProgressInputs,
} from "@/lib/competence-progress";

/**
 * Fase B2 — testes de contrato: os MESMOS contadores, alimentados pela
 * superfície da equipe (get_competence_overview) e pela superfície do cliente
 * (progress_inputs de get_client_competence_portal), devem produzir o MESMO
 * percentual. Não existe segunda fórmula.
 */

const zeroOverview = (over: Partial<CompetenceOverviewRow> = {}): CompetenceOverviewRow => ({
  client_id: "00000000-0000-0000-0000-000000000000",
  razao_social: "X",
  nome_fantasia: null,
  responsavel_nome: null,
  is_demo: false,
  checklist_total: 0,
  checklist_pendente: 0,
  checklist_recebido: 0,
  checklist_concluido: 0,
  checklist_cancelado: 0,
  pend_abertas: 0,
  pend_vencidas: 0,
  pend_concluidas: 0,
  pend_aguardando_cliente: 0,
  sol_aguardando_cliente: 0,
  sol_em_analise: 0,
  sol_concluidas: 0,
  sol_total: 0,
  sol_cancelado: 0,
  doc_total: 0,
  guias_total: 0,
  guias_vencidas: 0,
  guias_proximas: 0,
  guias_com_comprovante: 0,
  guias_sem_comprovante: 0,
  guias_cancelado: 0,
  guias_concluidas: 0,
  proc_ativos: 0,
  proc_atrasados: 0,
  proc_concluidos: 0,
  proc_aguardando_cliente: 0,
  ...over,
});

/** Constrói o par (linha staff, payload do portal) a partir dos contadores canônicos. */
function bothSurfaces(i: CompetenceProgressInputs) {
  const staffRow = zeroOverview({
    checklist_total: i.chk_total,
    checklist_cancelado: i.chk_cancelado,
    checklist_concluido: i.chk_concluido,
    sol_total: i.sol_total,
    sol_cancelado: i.sol_cancelado,
    sol_concluidas: i.sol_concluidas,
    guias_total: i.gui_total,
    guias_cancelado: i.gui_cancelado,
    guias_concluidas: i.gui_concluidas,
    pend_abertas: i.pend_abertas,
    pend_concluidas: i.pend_concluidas,
    proc_ativos: i.proc_ativos,
    proc_concluidos: i.proc_concluidos,
  });
  // payload jsonb do portal (somente números)
  const portalPayload = JSON.parse(JSON.stringify({ progress_inputs: { ...i } }));
  return {
    staff: computeProgress(progressInputsFromOverview(staffRow)).percent,
    portal: computeProgress(progressInputsFromPortal(portalPayload.progress_inputs)).percent,
  };
}

const inputs = (over: Partial<CompetenceProgressInputs> = {}): CompetenceProgressInputs => ({
  chk_total: 0,
  chk_cancelado: 0,
  chk_concluido: 0,
  sol_total: 0,
  sol_cancelado: 0,
  sol_concluidas: 0,
  gui_total: 0,
  gui_cancelado: 0,
  gui_concluidas: 0,
  pend_abertas: 0,
  pend_concluidas: 0,
  proc_ativos: 0,
  proc_concluidos: 0,
  ...over,
});

const CASES: Array<[string, CompetenceProgressInputs, number]> = [
  [
    "1 checklist concluído de 2 + 2 solicitações abertas",
    inputs({ chk_total: 2, chk_concluido: 1, sol_total: 2, sol_concluidas: 0 }),
    33,
  ],
  ["somente checklist 1 de 2", inputs({ chk_total: 2, chk_concluido: 1 }), 50],
  [
    "2 checklists: 1 cancelado e 1 concluído",
    inputs({ chk_total: 2, chk_cancelado: 1, chk_concluido: 1 }),
    100,
  ],
  // guia baixada / paga sem comprovante: o SQL já as classifica em gui_concluidas
  ["guia baixada sem comprovante", inputs({ gui_total: 1, gui_concluidas: 1 }), 100],
  ["guia paga sem comprovante", inputs({ gui_total: 1, gui_concluidas: 1 }), 100],
  ["guia com comprovante", inputs({ gui_total: 1, gui_concluidas: 1 }), 100],
  ["somente guia cancelada", inputs({ gui_total: 1, gui_cancelado: 1 }), 0],
  ["somente processos: 1 ativo e 1 concluído", inputs({ proc_ativos: 1, proc_concluidos: 1 }), 50],
  // "recebido" não entra em chk_concluido
  ["checklist recebido, sem concluídos", inputs({ chk_total: 2, chk_concluido: 0 }), 0],
  [
    "todos os módulos concluídos",
    inputs({
      chk_total: 2,
      chk_concluido: 2,
      sol_total: 1,
      sol_concluidas: 1,
      gui_total: 1,
      gui_concluidas: 1,
      pend_concluidas: 1,
      proc_concluidos: 1,
    }),
    100,
  ],
  ["nenhum item aplicável", inputs(), 0],
];

describe("Fase B2 — fórmula única de progresso", () => {
  for (const [label, i, expected] of CASES) {
    it(`${label} → ${expected}%`, () => {
      const { staff, portal } = bothSurfaces(i);
      expect(staff).toBe(expected);
      expect(portal).toBe(expected);
    });
  }

  it("paridade staff × portal em todos os casos (mesma fórmula efetiva)", () => {
    for (const [, i] of CASES) {
      const { staff, portal } = bothSurfaces(i);
      expect(portal).toBe(staff);
    }
  });

  it("pesos 40/20/20/10/10 e redistribuição de módulos sem itens", () => {
    // apenas checklist (40) e processos (10): 100% checklist, 0% processos → 40/50
    const { staff, portal } = bothSurfaces(
      inputs({ chk_total: 1, chk_concluido: 1, proc_ativos: 1, proc_concluidos: 0 }),
    );
    expect(staff).toBe(80);
    expect(portal).toBe(80);
  });

  it("nunca divide por zero e faz clamp entre 0 e 100", () => {
    expect(computeProgress(inputs()).percent).toBe(0);
    // contadores inconsistentes (concluídos > aplicáveis) não passam de 100
    expect(computeProgress(inputs({ chk_total: 1, chk_concluido: 5 })).percent).toBe(100);
    // cancelados maiores que o total não geram NaN/negativo
    expect(computeProgress(inputs({ chk_total: 1, chk_cancelado: 3 })).percent).toBe(0);
  });

  it("adaptador do portal tolera payload ausente, nulo ou com strings", () => {
    expect(computeProgress(progressInputsFromPortal(undefined)).percent).toBe(0);
    expect(computeProgress(progressInputsFromPortal(null)).percent).toBe(0);
    expect(
      computeProgress(
        progressInputsFromPortal({ chk_total: "2", chk_concluido: "1" } as unknown),
      ).percent,
    ).toBe(50);
  });

  it("progress_inputs contém somente contadores numéricos (sem campos internos)", () => {
    const i = inputs({ chk_total: 2, chk_concluido: 1 });
    const keys = Object.keys(i).sort();
    expect(keys).toEqual(
      [
        "chk_cancelado",
        "chk_concluido",
        "chk_total",
        "gui_cancelado",
        "gui_concluidas",
        "gui_total",
        "pend_abertas",
        "pend_concluidas",
        "proc_ativos",
        "proc_concluidos",
        "sol_cancelado",
        "sol_concluidas",
        "sol_total",
      ].sort(),
    );
    for (const v of Object.values(i)) expect(typeof v).toBe("number");
  });
});
