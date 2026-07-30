/**
 * Fase D3.2 — regras puras de classificação de anexos órfãos de Mensagens (chat).
 *
 * Este módulo NÃO acessa banco nem Storage: contém apenas as regras determinísticas
 * usadas pelo reconciliador interno (`/api/public/hooks/cleanup-chat-orphans`) e
 * pelos testes de contrato. Nenhum caminho ou nome de arquivo é logado por aqui.
 */

export const CHAT_BUCKET = "documents" as const;

/** Janela de segurança para uploads recentes (upload feito, INSERT ainda pendente/falho). */
export const RECENT_UPLOAD_WINDOW_HOURS = 24;

/** Tamanho da página de listagem no Storage. */
export const LIST_PAGE_SIZE = 100;

/** Lote de remoção enviado por chamada à API do Storage. */
export const DELETE_BATCH_SIZE = 25;

/** Teto absoluto de remoções por execução (proteção contra remoção em massa). */
export const MAX_DELETIONS_PER_RUN = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Prefixo estrito de chat: `<uuid>/chat/<...segmentos não vazios>/<arquivo>`.
 * Qualquer outro formato é rejeitado (nunca é candidato).
 */
export function isStrictChatPath(path: string | null | undefined): boolean {
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.startsWith("/") || path.endsWith("/") || path.includes("//")) return false;
  if (path.includes("..")) return false;
  const segs = path.split("/");
  if (segs.length < 3) return false;
  if (!UUID_RE.test(segs[0])) return false;
  if (segs[1] !== "chat") return false;
  return segs.slice(2).every((s) => s.trim().length > 0);
}

export function isOutsideRecentWindow(
  createdAtIso: string | null | undefined,
  now: Date = new Date(),
  windowHours: number = RECENT_UPLOAD_WINDOW_HOURS,
): boolean {
  if (!createdAtIso) return false; // sem data técnica confiável → nunca elegível
  const t = Date.parse(createdAtIso);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t >= windowHours * 3600_000;
}

export type Candidate = {
  path: string;
  createdAt: string | null;
  size: number;
  /** true quando existe referência exata em chat_messages ou em qualquer outra tabela conhecida. */
  referenced: boolean;
};

export type Classification =
  | "not_chat_path"
  | "active_reference"
  | "recent_upload"
  | "orphan";

export function classify(c: Candidate, now: Date = new Date()): Classification {
  if (!isStrictChatPath(c.path)) return "not_chat_path";
  if (c.referenced) return "active_reference";
  if (!isOutsideRecentWindow(c.createdAt, now)) return "recent_upload";
  return "orphan";
}

/** Métricas agregadas — nunca contém caminhos, nomes, empresas ou usuários. */
export type RunSummary = {
  mode: "dry-run" | "effective";
  analyzed: number;
  eligible: number;
  removed: number;
  preserved: number;
  failed: number;
  bytes_eligible: number;
  bytes_removed: number;
  duration_ms: number;
  capped: boolean;
};

export function emptySummary(mode: RunSummary["mode"]): RunSummary {
  return {
    mode,
    analyzed: 0,
    eligible: 0,
    removed: 0,
    preserved: 0,
    failed: 0,
    bytes_eligible: 0,
    bytes_removed: 0,
    duration_ms: 0,
    capped: false,
  };
}
