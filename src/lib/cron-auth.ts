/**
 * Fase D3.3 — autenticação central dos crons internos.
 *
 * Regras (idênticas para todas as rotas internas sob /api/public/hooks/*):
 *  - o segredo deve vir no header `x-cron-secret` (ou `Authorization: Bearer <segredo>`);
 *  - ausência de segredo  → não autorizado;
 *  - segredo incorreto    → não autorizado;
 *  - JWT de usuário sozinho não autoriza;
 *  - `apikey` sozinho não autoriza (o header sequer é lido);
 *  - o valor recebido nunca é logado, retornado ou anexado a mensagens de erro.
 *
 * Duas fontes de verdade são aceitas, nesta ordem:
 *  1. `process.env.CRON_SECRET` (segredo server-only do projeto);
 *  2. `cron_internal_secret` no Vault do banco, verificado pela RPC
 *     `public.cron_secret_matches` (executável apenas por service_role).
 *
 * A segunda fonte existe para que o pg_cron possa autenticar-se buscando o
 * segredo dinamicamente no Vault, sem que nenhum valor literal apareça no
 * comando salvo em `cron.job`, em migrations ou no repositório.
 */

const HEADER = "x-cron-secret";

/** Comparação sem short-circuit por caractere (não vaza o conteúdo comparado). */
function equals(provided: string, expected: string): boolean {
  if (expected.length === 0 || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Extrai o segredo apresentado. Nunca retorna `apikey` nem cookies. */
export function extractCronSecret(request: Request): string {
  const header = request.headers.get(HEADER);
  if (header && header.length > 0) return header;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  // `Authorization` sem prefixo Bearer não é aceito como segredo.
  return auth === bearer ? "" : bearer;
}

/** Resposta padrão para chamadas não autenticadas (nenhuma lógica de negócio roda antes). */
export function cronUnauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verifica o segredo interno. Retorna apenas `true`/`false`; qualquer falha de
 * infraestrutura é tratada como "não autorizado".
 */
export async function isAuthorizedCronRequest(request: Request): Promise<boolean> {
  const provided = extractCronSecret(request);
  if (provided.length === 0) return false;

  const envSecret = process.env.CRON_SECRET ?? "";
  if (envSecret.length > 0 && equals(provided, envSecret)) return true;

  // Fallback: o segredo vive somente no Vault. A comparação acontece dentro do
  // banco; o valor esperado nunca trafega de volta para o runtime.
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return false;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, svc, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc("cron_secret_matches", { p_provided: provided });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
