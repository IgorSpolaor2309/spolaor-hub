import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { limit: number; offset: number };

export default defineTool({
  name: "list_pending_tasks",
  title: "Listar pendências",
  description:
    "Lista as pendências (pending_tasks) visíveis ao usuário autenticado, respeitando as políticas de acesso da Digital SC.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Máximo de pendências a retornar."),
    offset: z.number().int().min(0).max(10000).default(0).describe("Deslocamento para paginação."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_pending_tasks", async ({ limit, offset }, _ctx, supabase) => {
    const { data, error, count } = await supabase
      .from("pending_tasks")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
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
