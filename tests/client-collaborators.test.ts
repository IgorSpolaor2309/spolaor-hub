import { describe, it, expect } from "vitest";
import {
  carteiraAlert,
  eligibleWithin,
  linkErrorMessage,
  resolvePrimary,
  type CollaboratorOption,
} from "@/lib/client-collaborators";

/**
 * Fase E1.2C — a interface espelha (nunca substitui) a regra do servidor:
 * o responsável principal é único, precisa estar vinculado e ser da equipe.
 */

const opt = (id: string, over: Partial<CollaboratorOption> = {}): CollaboratorOption => ({
  collaborator_id: id,
  nome: `Colab ${id}`,
  email: `${id}@x.com`,
  status: "active",
  linked: true,
  is_primary: false,
  eligible_primary: true,
  ineligible_reason: null,
  ...over,
});

const staffA = opt("a");
const staffB = opt("b");
const semConta = opt("c", { eligible_primary: false, ineligible_reason: "Sem conta de acesso" });
const inativo = opt("d", { status: "inactive", eligible_primary: false, ineligible_reason: "Colaborador inativo" });

describe("elegibilidade a responsável principal", () => {
  it("considera apenas colaboradores selecionados e elegíveis", () => {
    expect(eligibleWithin(["a", "c", "d"], [staffA, semConta, inativo])).toEqual(["a"]);
  });

  it("um único elegível vira principal automaticamente", () => {
    expect(resolvePrimary(["a", "c"], [staffA, semConta], null)).toEqual({ primary: "a", error: null });
  });

  it("com dois ou mais elegíveis a escolha é obrigatória", () => {
    const r = resolvePrimary(["a", "b"], [staffA, staffB], null);
    expect(r.primary).toBeNull();
    expect(r.error).toMatch(/Selecione qual colaborador/);
  });

  it("respeita a escolha explícita", () => {
    expect(resolvePrimary(["a", "b"], [staffA, staffB], "b").primary).toBe("b");
  });

  it("nunca escolhe por ordem, nome ou data quando há empate", () => {
    for (const ordered of [[staffA, staffB], [staffB, staffA]]) {
      expect(resolvePrimary(["a", "b"], ordered, null).primary).toBeNull();
    }
  });

  it("recusa principal não vinculado", () => {
    const r = resolvePrimary(["a"], [staffA, staffB], "b");
    expect(r.primary).toBeNull();
    expect(r.error).toMatch(/precisa estar entre os colaboradores vinculados/);
  });

  it("recusa principal inelegível (sem conta da equipe ou inativo)", () => {
    for (const id of ["c", "d"]) {
      const r = resolvePrimary(["a", id], [staffA, semConta, inativo], id);
      expect(r.primary).toBeNull();
      expect(r.error).toMatch(/não pode ser responsável principal/);
    }
  });

  it("nenhum elegível selecionado é erro explícito", () => {
    const r = resolvePrimary(["c", "d"], [semConta, inativo], null);
    expect(r.primary).toBeNull();
    expect(r.error).toMatch(/responsável principal elegível/);
  });

  it("seleção vazia também é erro (empresa ativa exige responsável)", () => {
    expect(resolvePrimary([], [], null).error).toBeTruthy();
  });
});

describe("alertas diferenciados da carteira", () => {
  it("sem vínculo", () => {
    expect(carteiraAlert({ linkedCount: 0, hasEligiblePrimary: false })).toEqual({
      kind: "sem_vinculo",
      label: "Empresa sem colaborador encarregado",
    });
  });
  it("vinculada porém sem principal", () => {
    expect(carteiraAlert({ linkedCount: 2, hasEligiblePrimary: false })?.kind).toBe("sem_principal");
  });
  it("carteira completa não gera alerta", () => {
    expect(carteiraAlert({ linkedCount: 1, hasEligiblePrimary: true })).toBeNull();
  });
});

describe("mensagens de erro", () => {
  it("traduz negativa de permissão", () => {
    expect(linkErrorMessage({ message: "new row violates row-level security policy" })).toMatch(
      /não tem permissão/i,
    );
  });
  it("preserva a mensagem específica do servidor", () => {
    const msg = "Empresa ativa precisa de um responsável principal.";
    expect(linkErrorMessage({ message: msg })).toBe(msg);
  });
  it("tem fallback sem quebrar", () => {
    expect(linkErrorMessage(null)).toBeTruthy();
  });
});
