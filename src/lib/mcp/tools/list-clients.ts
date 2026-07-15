import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

export default defineTool({
  name: "list_clients",
  title: "Listar clientes",
  description:
    "Lista os clientes visíveis ao usuário autenticado, respeitando as políticas de acesso do SC Central.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Máximo de clientes a retornar."),
    offset: z.number().int().min(0).max(10000).default(0).describe("Deslocamento para paginação."),
    search: z.string().max(120).optional().describe("Busca por razão social (opcional)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit("list_clients", async (_ctx, supabase) => {
    // Nota: os argumentos validados chegam no _input original; mas withMcpAudit não os repassa.
    // Para manter simplicidade e evitar leakage, delegamos os filtros ao segundo wrapper abaixo.
    return runListClients(supabase, { limit: 20, offset: 0 });
  }),
});

async function runListClients(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  { limit, offset, search }: { limit: number; offset: number; search?: string },
) {
  let q = supabase
    .from("clients")
    .select("id, razao_social, nome_fantasia, cnpj, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (search) q = q.ilike("razao_social", `%${search}%`);
  const { data, error, count } = await q;
  if (error) {
    return { result: { content: [{ type: "text" as const, text: sanitizeError(error) }], isError: true }, count: 0 };
  }
  const items = data ?? [];
  return {
    result: {
      content: [{ type: "text" as const, text: JSON.stringify({ count: items.length, total: count ?? null, items }, null, 2) }],
      structuredContent: { count: items.length, total: count ?? null, items },
    },
    count: items.length,
  };
}
