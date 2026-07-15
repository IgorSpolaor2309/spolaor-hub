import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { limit: number; offset: number; status?: string };

export default defineTool({
  name: "list_processes",
  title: "Listar processos",
  description:
    "Lista os processos (company_processes) visíveis ao usuário autenticado, respeitando as políticas de acesso do SC Central.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Máximo de processos a retornar."),
    offset: z.number().int().min(0).max(10000).default(0).describe("Deslocamento para paginação."),
    status: z.string().max(40).optional().describe("Filtrar por status (opcional)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_processes", async ({ limit, offset, status }, _ctx, supabase) => {
    let q = supabase
      .from("company_processes")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status) q = q.eq("status", status);
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
