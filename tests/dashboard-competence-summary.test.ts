import { describe, expect, it } from "vitest";
import {
  computeProgress, computeSituacao, progressInputsFromOverview,
  type CompetenceOverviewRow,
} from "@/lib/competence-progress";
import { ATTENTION_ORDER, summarizeCompetenceOverview } from "@/lib/competence-summary";

/** Linha neutra do overview: tudo zerado, sem atividade. */
function row(over: Partial<CompetenceOverviewRow> = {}): CompetenceOverviewRow {
  return {
    client_id: "c1", razao_social: "Empresa", nome_fantasia: null,
    responsavel_nome: null, is_demo: false,
    checklist_total: 0, checklist_pendente: 0, checklist_recebido: 0,
    checklist_concluido: 0, checklist_cancelado: 0,
    pend_abertas: 0, pend_vencidas: 0, pend_concluidas: 0, pend_aguardando_cliente: 0,
    sol_aguardando_cliente: 0, sol_em_analise: 0, sol_concluidas: 0, sol_total: 0, sol_cancelado: 0,
    doc_total: 0,
    guias_total: 0, guias_vencidas: 0, guias_proximas: 0, guias_com_comprovante: 0,
    guias_sem_comprovante: 0, guias_cancelado: 0, guias_concluidas: 0,
    proc_ativos: 0, proc_atrasados: 0, proc_concluidos: 0, proc_aguardando_cliente: 0,
    ...over,
  };
}

describe("paridade Dashboard × /competencias", () => {
  const linha = row({
    client_id: "x", checklist_total: 4, checklist_concluido: 2, checklist_cancelado: 1,
    sol_total: 2, sol_concluidas: 1, guias_total: 2, guias_concluidas: 1, guias_com_comprovante: 1,
    pend_abertas: 1, pend_concluidas: 1, proc_ativos: 1, proc_concluidos: 1, doc_total: 3,
  });

  it("mesma linha gera a mesma situação nas duas superfícies", () => {
    const dashboard = summarizeCompetenceOverview([linha]);
    expect(dashboard.bySituacao[computeSituacao(linha)]).toBe(1);
  });

  it("mesma linha gera o mesmo progresso (fórmula única)", () => {
    const a = computeProgress(progressInputsFromOverview(linha)).percent;
    const b = computeProgress(progressInputsFromOverview({ ...linha })).percent;
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
  });

  it("o helper não recalcula percentual próprio", () => {
    const s = summarizeCompetenceOverview([linha]) as Record<string, unknown>;
    expect(s.percent).toBeUndefined();
    expect(s.progresso).toBeUndefined();
  });
});

describe("regras canônicas preservadas", () => {
  it("cancelados saem do universo aplicável e não distorcem o progresso", () => {
    const semCancel = row({ checklist_total: 2, checklist_concluido: 2 });
    const comCancel = row({ checklist_total: 4, checklist_concluido: 2, checklist_cancelado: 2 });
    expect(computeProgress(progressInputsFromOverview(comCancel)).percent)
      .toBe(computeProgress(progressInputsFromOverview(semCancel)).percent);
  });

  it("guia fechada usa a regra canônica (guias_concluidas)", () => {
    const paga = row({ guias_total: 1, guias_concluidas: 1, guias_com_comprovante: 1 });
    expect(computeProgress(progressInputsFromOverview(paga)).percent).toBe(100);
  });

  it("processos atrasados vêm exclusivamente de proc_atrasados", () => {
    const s = summarizeCompetenceOverview([
      row({ client_id: "a", proc_atrasados: 2, proc_ativos: 3, doc_total: 1 }),
      row({ client_id: "b", proc_atrasados: 1, proc_ativos: 1, doc_total: 1 }),
    ]);
    expect(s.procAtrasados).toBe(3);
  });

  it("empresa sem documentos usa doc_total === 0", () => {
    const s = summarizeCompetenceOverview([
      row({ client_id: "a", razao_social: "A", doc_total: 0 }),
      row({ client_id: "b", razao_social: "B", doc_total: 5 }),
    ]);
    expect(s.semDocumentos.map((x) => x.client_id)).toEqual(["a"]);
  });
});

describe("escopo Real, Demo, inativas e excluídas", () => {
  it("Demo não aparece no Dashboard Real", () => {
    const s = summarizeCompetenceOverview([
      row({ client_id: "real" }),
      row({ client_id: "demo", is_demo: true }),
    ]);
    expect(s.total).toBe(1);
    expect(s.semDocumentos.map((x) => x.client_id)).toEqual(["real"]);
  });

  it("Demo pode ser incluída explicitamente (homologação)", () => {
    const s = summarizeCompetenceOverview([row({ is_demo: true })], { includeDemo: true });
    expect(s.total).toBe(1);
  });

  it("empresa inativa não entra na carga atual (a RPC não a devolve)", () => {
    // A RPC filtra status <> 'inactive'; o Dashboard consome apenas o que vem dela.
    const s = summarizeCompetenceOverview([]);
    expect(s.total).toBe(0);
    expect(s.bySituacao.com_atrasos).toBe(0);
  });

  it("empresa excluída não reaparece como sem atividade", () => {
    // deleted_at IS NULL na RPC: linha ausente => nada em sem_atividade.
    const s = summarizeCompetenceOverview([]);
    expect(s.bySituacao.sem_atividade).toBe(0);
    expect(s.semDocumentos).toEqual([]);
  });
});

describe("agregação e ordenação de atenção", () => {
  const rows = [
    row({ client_id: "atraso", razao_social: "D", pend_vencidas: 1, doc_total: 1 }),
    row({ client_id: "aguard", razao_social: "C", sol_total: 1, sol_aguardando_cliente: 1, doc_total: 1 }),
    row({ client_id: "vazio", razao_social: "B" }),
    row({ client_id: "andamento", razao_social: "A", checklist_total: 2, checklist_concluido: 0, doc_total: 1 }),
    row({ client_id: "revisao", razao_social: "E", checklist_total: 1, checklist_concluido: 1, doc_total: 1 }),
  ];

  it("combina situações distintas corretamente", () => {
    const s = summarizeCompetenceOverview(rows);
    expect(s.total).toBe(5);
    expect(s.bySituacao.com_atrasos).toBe(1);
    expect(s.bySituacao.aguardando_cliente).toBe(1);
    expect(s.bySituacao.sem_atividade).toBe(1);
    expect(s.bySituacao.em_andamento).toBe(1);
    expect(s.bySituacao.pronta_revisao).toBe(1);
  });

  it("ordena a lista de atenção com a prioridade oficial e omite pronta para revisão", () => {
    const s = summarizeCompetenceOverview(rows);
    expect(s.atencao.map((x) => x.client_id)).toEqual(["atraso", "aguard", "vazio", "andamento"]);
    expect(ATTENTION_ORDER.com_atrasos).toBeLessThan(ATTENTION_ORDER.aguardando_cliente);
    expect(ATTENTION_ORDER.sem_atividade).toBeLessThan(ATTENTION_ORDER.em_andamento);
    expect(ATTENTION_ORDER.em_andamento).toBeLessThan(ATTENTION_ORDER.pronta_revisao);
  });

  it("zero itens não causa divisão por zero", () => {
    const s = summarizeCompetenceOverview([]);
    expect(s.total).toBe(0);
    expect(s.procAtrasados).toBe(0);
    expect(s.atencao).toEqual([]);
    expect(computeProgress(progressInputsFromOverview(row())).percent).toBe(0);
  });

  it("entrada nula ou indefinida é tolerada", () => {
    expect(summarizeCompetenceOverview(null).total).toBe(0);
    expect(summarizeCompetenceOverview(undefined).total).toBe(0);
  });

  it("agregação é pura: não muta a origem", () => {
    const src = [row({ client_id: "a", doc_total: 0 })];
    const snapshot = JSON.stringify(src);
    summarizeCompetenceOverview(src);
    expect(JSON.stringify(src)).toBe(snapshot);
  });
});

describe("escopo por perfil", () => {
  it("Administrador agrega todo o conjunto autorizado", () => {
    const s = summarizeCompetenceOverview([row({ client_id: "a" }), row({ client_id: "b" })]);
    expect(s.total).toBe(2);
  });

  it("Colaborador agrega apenas a carteira devolvida pela RPC/RLS", () => {
    const carteira = summarizeCompetenceOverview([row({ client_id: "a" })]);
    expect(carteira.total).toBe(1);
    expect(carteira.atencao.map((x) => x.client_id)).toEqual(["a"]);
  });

  it("o resumo nunca expõe metadados internos ao Cliente", () => {
    const s = summarizeCompetenceOverview([row({ responsavel_nome: "Fulano" })]);
    const serialized = JSON.stringify(s);
    expect(serialized).not.toContain("Fulano");
    expect(serialized).not.toContain("responsavel");
  });
});
