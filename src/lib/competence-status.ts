// Helpers de status oficial da competência (Fase 2).

export type OfficialStatus =
  | "open"
  | "in_progress"
  | "awaiting_client"
  | "in_review"
  | "completed"
  | "reopened";

export const OFFICIAL_LABEL: Record<OfficialStatus, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  awaiting_client: "Aguardando cliente",
  in_review: "Em revisão",
  completed: "Concluída",
  reopened: "Reaberta",
};

export const OFFICIAL_TONE: Record<OfficialStatus, string> = {
  open: "bg-slate-100 text-slate-800",
  in_progress: "bg-blue-100 text-blue-800",
  awaiting_client: "bg-amber-100 text-amber-800",
  in_review: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-800",
  reopened: "bg-orange-100 text-orange-800",
};

export type CompetenceRow = {
  id: string;
  client_id: string;
  competence: string;
  status: OfficialStatus;
  responsible_profile_id: string | null;
  review_requested_at: string | null;
  review_requested_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_notes: string | null;
  completion_summary: any;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  awaiting_client_note: string | null;
  awaiting_client_since: string | null;
  is_demo: boolean;
  demo_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

// Transições válidas (espelhadas do backend).
const VALID: Array<[OfficialStatus, OfficialStatus]> = [
  ["open", "in_progress"],
  ["open", "awaiting_client"],
  ["in_progress", "awaiting_client"],
  ["awaiting_client", "in_progress"],
  ["in_progress", "in_review"],
  ["awaiting_client", "in_review"],
  ["in_review", "in_progress"],
  ["in_review", "completed"],
  ["completed", "reopened"],
  ["reopened", "in_progress"],
  ["reopened", "in_review"],
];

export function canTransition(from: OfficialStatus, to: OfficialStatus): boolean {
  return VALID.some(([f, t]) => f === from && t === to);
}
