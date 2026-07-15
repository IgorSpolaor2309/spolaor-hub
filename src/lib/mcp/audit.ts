import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Sanitiza mensagens de erro para o cliente MCP:
 * - remove códigos SQL, stack traces e detalhes internos do Postgres;
 * - preserva uma frase curta e legível.
 */
export function sanitizeError(err: unknown): string {
  const raw = typeof err === "string" ? err : (err as { message?: string })?.message ?? "";
  if (!raw) return "Erro interno.";
  const firstLine = raw.split("\n")[0]!.trim();
  // Descartar identificadores SQL/PG e mensagens do PostgREST verbosas
  if (/permission denied|row-level security|violates|policy/i.test(firstLine)) {
    return "Acesso negado pelas políticas de segurança.";
  }
  if (/JWT|token|expired|invalid_grant/i.test(firstLine)) {
    return "Sessão inválida ou expirada. Reautentique.";
  }
  // Trunca e remove referências a schemas/tabelas
  return firstLine.replace(/["`]/g, "").slice(0, 180);
}

/** Cliente Supabase escopado ao usuário (RLS aplicada como o usuário). */
export function userScopedClient(ctx: ToolContext): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifica se o perfil do usuário está com status='active'. Bloqueia inativos. */
export async function ensureActiveUser(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("status").eq("id", userId).maybeSingle();
  if (error) return "Falha ao verificar status do usuário.";
  if (!data) return "Perfil não encontrado.";
  if (data.status !== "active") return "Usuário inativo. Acesso bloqueado.";
  return null;
}

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/**
 * Envolve um handler de tool:
 * - verifica autenticação e status active;
 * - mede duração;
 * - registra em mcp_audit_log (sem tokens, sem payloads sensíveis);
 * - sanitiza erros.
 */
export function withMcpAudit(
  toolName: string,
  run: (ctx: ToolContext, supabase: SupabaseClient) => Promise<{ result: ToolResult; count: number }>,
) {
  return async (_input: unknown, ctx: ToolContext): Promise<ToolResult> => {
    const startedAt = Date.now();
    let success = false;
    let count: number | null = null;
    let errorMessage: string | null = null;
    let result: ToolResult;

    if (!ctx.isAuthenticated()) {
      result = { content: [{ type: "text", text: "Não autenticado." }], isError: true };
      errorMessage = "unauthenticated";
      await writeAudit({ ctx, toolName, success: false, count: null, durationMs: Date.now() - startedAt, errorMessage });
      return result;
    }

    const supabase = userScopedClient(ctx);
    const inactive = await ensureActiveUser(supabase, ctx.getUserId()!);
    if (inactive) {
      result = { content: [{ type: "text", text: inactive }], isError: true };
      await writeAudit({
        ctx, toolName, success: false, count: null, durationMs: Date.now() - startedAt, errorMessage: inactive,
      });
      return result;
    }

    try {
      const out = await run(ctx, supabase);
      result = out.result;
      count = out.count;
      success = !out.result.isError;
      if (!success) errorMessage = out.result.content[0]?.text ?? "erro";
    } catch (err) {
      const safe = sanitizeError(err);
      errorMessage = safe;
      result = { content: [{ type: "text", text: safe }], isError: true };
    }

    await writeAudit({
      ctx, toolName, success, count, durationMs: Date.now() - startedAt, errorMessage,
    });
    return result;
  };
}

async function writeAudit(args: {
  ctx: ToolContext;
  toolName: string;
  success: boolean;
  count: number | null;
  durationMs: number;
  errorMessage: string | null;
}) {
  try {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("mcp_audit_log").insert({
      user_id: args.ctx.getUserId() ?? null,
      user_email: args.ctx.getUserEmail() ?? null,
      tool_name: args.toolName,
      success: args.success,
      result_count: args.count,
      duration_ms: args.durationMs,
      error_message: args.errorMessage,
    });
  } catch {
    // Nunca falhar a chamada da tool por causa de log; não vaza detalhes.
  }
}
