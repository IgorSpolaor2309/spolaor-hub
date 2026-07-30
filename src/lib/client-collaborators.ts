/**
 * Fase E1.2C — regra única do "responsável principal" da empresa.
 *
 * A fonte de verdade é `client_collaborators` (coluna `is_primary`), gravada
 * exclusivamente pela RPC `admin_sync_client_collaborators`. Este módulo
 * contém apenas os espelhos de leitura/validação usados pela interface —
 * nenhuma regra é decidida no navegador.
 */

export type CollaboratorOption = {
  collaborator_id: string;
  nome: string;
  email: string | null;
  status: string;
  linked: boolean;
  is_primary: boolean;
  eligible_primary: boolean;
  ineligible_reason: string | null;
};

export const PRIMARY_HINT =
  "Receberá as competências e atribuições gerais da empresa.";

/** Ids elegíveis a principal dentro de uma seleção. */
export function eligibleWithin(
  selected: string[],
  options: CollaboratorOption[],
): string[] {
  const byId = new Map(options.map((o) => [o.collaborator_id, o]));
  return selected.filter((id) => byId.get(id)?.eligible_primary === true);
}

/**
 * Espelho da regra do servidor: com exatamente um elegível ele vira principal
 * automaticamente; com dois ou mais é obrigatório escolher. Nunca escolhe por
 * data, ordem, nome ou menor id.
 */
export function resolvePrimary(
  selected: string[],
  options: CollaboratorOption[],
  chosen: string | null,
): { primary: string | null; error: string | null } {
  const elig = eligibleWithin(selected, options);
  if (chosen && !selected.includes(chosen)) {
    return { primary: null, error: "O responsável principal precisa estar entre os colaboradores vinculados." };
  }
  if (chosen && !elig.includes(chosen)) {
    return {
      primary: null,
      error: "Este colaborador não pode ser responsável principal: é necessário estar ativo e possuir conta de acesso da equipe.",
    };
  }
  if (chosen) return { primary: chosen, error: null };
  if (elig.length === 1) return { primary: elig[0], error: null };
  if (elig.length === 0) {
    return {
      primary: null,
      error: "Empresa ativa precisa de um responsável principal elegível (colaborador ativo com conta de acesso da equipe).",
    };
  }
  return { primary: null, error: "Selecione qual colaborador será o responsável principal desta empresa." };
}

/** Erro do servidor sem mensagem genérica (mantém o texto específico da RPC). */
export function linkErrorMessage(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? "";
  if (/row-level security|permission denied/i.test(msg)) {
    return "Você não tem permissão para gerenciar a carteira desta empresa.";
  }
  return msg || "Não foi possível salvar os colaboradores encarregados.";
}

/** Alertas diferenciados usados nas listas/ficha da empresa. */
export function carteiraAlert(input: {
  linkedCount: number;
  hasEligiblePrimary: boolean;
}): { kind: "sem_vinculo" | "sem_principal"; label: string } | null {
  if (input.linkedCount === 0) {
    return { kind: "sem_vinculo", label: "Empresa sem colaborador encarregado" };
  }
  if (!input.hasEligiblePrimary) {
    return { kind: "sem_principal", label: "Empresa sem responsável principal" };
  }
  return null;
}
