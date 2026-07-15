import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { limit: number; offset: number; search?: string };

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
  handler: withMcpAudit<Input>("list_clients", async ({ limit, offset, search }, _ctx, supabase) => {
    let q = supabase
      .from("clients")
      .select("id, razao_social, nome_fantasia, cnpj, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (search) q = q.ilike("razao_social", `%${search}%`);
    const { data, error, count } = await q;
    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }
    const items = data ?? [];
    const payload = { count: items.length, total: count ?? null, items };
    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      },
      count: items.length,
    };
  }),
});
