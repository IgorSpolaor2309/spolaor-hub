import { describe, expect, it } from "vitest";
import {
  TIPO_INCLUSAO_VALUES,
  effectivePrice,
  limiteLabel,
  normalizeDraft,
  requiresLimite,
  situacaoOf,
  validateRule,
  type PlanServiceRule,
} from "@/lib/plan-services";

const baseRule = (over: Partial<PlanServiceRule> = {}): PlanServiceRule => ({
  id: "r1",
  plan_id: "p1",
  service_id: "s1",
  tipo_inclusao: "incluido",
  limite_quantidade: null,
  unidade_limite: null,
  periodicidade_limite: null,
  valor_especifico: null,
  valor_especifico_provisorio: true,
  observacoes: null,
  ordem: 0,
  status: "ativo",
  ...over,
});

const svc = (over: Partial<{ valor_referencia: number | null; valor_provisorio: boolean; tipo_preco: string }> = {}) => ({
  valor_referencia: 100,
  valor_provisorio: true,
  tipo_preco: "fixo",
  ...over,
});

describe("tipos de inclusão", () => {
  it("aceita somente os cinco tipos previstos", () => {
    expect([...TIPO_INCLUSAO_VALUES].sort()).toEqual(
      ["cobrado_a_parte", "incluido", "incluido_com_limite", "indisponivel", "sob_orcamento"].sort(),
    );
  });
  it("rejeita tipo desconhecido", () => {
    expect(validateRule({ tipo_inclusao: "gratis", limite_quantidade: null })).toContain("Tipo de inclusão inválido");
  });
});

describe("limite obrigatório apenas quando aplicável", () => {
  it("exige limite em incluido_com_limite", () => {
    expect(requiresLimite("incluido_com_limite")).toBe(true);
    expect(validateRule({ tipo_inclusao: "incluido_com_limite", limite_quantidade: null }).length).toBe(1);
    expect(validateRule({ tipo_inclusao: "incluido_com_limite", limite_quantidade: 0 }).length).toBe(1);
    expect(validateRule({ tipo_inclusao: "incluido_com_limite", limite_quantidade: 2 })).toEqual([]);
  });
  it("não exige limite nos outros tipos", () => {
    for (const t of ["incluido", "cobrado_a_parte", "sob_orcamento", "indisponivel"]) {
      expect(requiresLimite(t)).toBe(false);
      expect(validateRule({ tipo_inclusao: t, limite_quantidade: null })).toEqual([]);
    }
  });
  it("descarta limite ao normalizar tipos sem limite", () => {
    const n = normalizeDraft({ tipo_inclusao: "incluido", limite_quantidade: 5, unidade_limite: "nota" });
    expect(n.limite_quantidade).toBeNull();
  });
  it("valida periodicidade do limite", () => {
    expect(validateRule({ tipo_inclusao: "incluido", limite_quantidade: null, periodicidade_limite: "diario" }))
      .toContain("Periodicidade do limite inválida");
    expect(validateRule({ tipo_inclusao: "incluido", limite_quantidade: null, periodicidade_limite: "mensal" })).toEqual([]);
  });
});

describe("preço específico opcional e precedência de leitura", () => {
  it("usa o catálogo quando não há valor específico", () => {
    const r = effectivePrice(svc(), baseRule());
    expect(r).toEqual({ valor: 100, origem: "catalogo", provisorio: true });
  });
  it("valor específico do plano tem precedência", () => {
    const r = effectivePrice(svc(), baseRule({ valor_especifico: 80, valor_especifico_provisorio: false }));
    expect(r).toEqual({ valor: 80, origem: "plano", provisorio: false });
  });
  it("preço específico é opcional e pode ser removido", () => {
    expect(validateRule({ tipo_inclusao: "incluido", limite_quantidade: null, valor_especifico: null })).toEqual([]);
    expect(normalizeDraft({ tipo_inclusao: "incluido", limite_quantidade: null }).valor_especifico).toBeNull();
  });
  it("rejeita valor negativo", () => {
    expect(validateRule({ tipo_inclusao: "incluido", limite_quantidade: null, valor_especifico: -1 }).length).toBe(1);
  });
  it("serviço sem valor de referência fica indefinido, sem preço fictício", () => {
    expect(effectivePrice(svc({ valor_referencia: null }), null).valor).toBeNull();
    expect(effectivePrice(svc({ valor_referencia: null }), null).origem).toBe("indefinido");
  });
  it("sob orçamento não inventa valor", () => {
    expect(effectivePrice(svc({ tipo_preco: "sob_orcamento" }), baseRule({ tipo_inclusao: "sob_orcamento" })).origem)
      .toBe("sob_orcamento");
  });
});

describe("ausência de regra = não configurado", () => {
  it("sem regra retorna nao_configurado sem inserir nada", () => {
    expect(situacaoOf(null)).toBe("nao_configurado");
    expect(situacaoOf(undefined)).toBe("nao_configurado");
  });
  it("regra ativa e inativa", () => {
    expect(situacaoOf(baseRule())).toBe("ativo");
    expect(situacaoOf(baseRule({ status: "inativo" }))).toBe("inativo");
  });
  it("catálogo extraordinário sem regra não é interpretado como extra/indisponível", () => {
    const s = situacaoOf(null);
    expect(s).not.toBe("ativo");
    expect(s).not.toBe("inativo");
  });
});

describe("rótulo de limite", () => {
  it("formata limite, unidade e periodicidade", () => {
    expect(limiteLabel(baseRule({ limite_quantidade: 2, unidade_limite: "banco", periodicidade_limite: "mensal" })))
      .toBe("2 banco / mensal");
  });
  it("sem limite exibe travessão", () => {
    expect(limiteLabel(null)).toBe("—");
    expect(limiteLabel(baseRule())).toBe("—");
  });
});
