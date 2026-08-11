import { supabase } from "@/integrations/supabase/client";
import { formatCompetence } from "./competencia";

export type ClientPlanVigency = {
  id: string;
  client_id: string;
  plan_id: string;
  competencia_inicio: string;
  competencia_fim: string | null;
  status: 'ativo' | 'encerrado';
  created_at: string;
  plans?: {
    nome: string;
  };
};

export type VigencyDraft = {
  client_id: string;
  plan_id: string;
  start_competence: string;
};

/**
 * Finds the effective plan for a specific client and competence.
 * Prioritizes database RPC for accuracy.
 */
export async function getPlanForCompetence(clientId: string, competence: string) {
  const { data, error } = await (supabase as any).rpc('get_plan_for_competence', {
    p_client_id: clientId,
    p_competence: competence
  });

  if (error) {
    console.error('[client-plans] Error fetching plan for competence:', error);
    return null;
  }

  const rows = data as any[];
  return rows?.[0] || null;
}

/**
 * Assigns a plan starting at a specific competence.
 */
export async function assignPlan(clientId: string, planId: string, startCompetence: string) {
  const { data, error } = await (supabase as any).rpc('assign_client_plan', {
    p_client_id: clientId,
    p_plan_id: planId,
    p_start_competence: startCompetence
  });

  if (error) {
    throw error;
  }

  return data as string;
}

/**
 * Validates if a competence string is valid (YYYY-MM).
 */
export function isValidCompetence(comp: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(comp);
}

/**
 * Formats a range of competences (Start - End or Present).
 */
export function formatCompetenceRange(start: string, end: string | null): string {
  const startFmt = isValidCompetence(start) ? formatCompetence(start) : start;
  if (!end) return `${startFmt} - Presente`;
  const endFmt = isValidCompetence(end) ? formatCompetence(end) : end;
  return `${startFmt} - ${endFmt}`;
}

/**
 * Basic client-side validation for a new vigency assignment.
 */
export function validateVigency(draft: VigencyDraft): string | null {
  if (!draft.client_id) return "Selecione um cliente";
  if (!draft.plan_id) return "Selecione um plano";
  if (!isValidCompetence(draft.start_competence)) return "Competência inicial inválida (use AAAA-MM)";
  return null;
}

