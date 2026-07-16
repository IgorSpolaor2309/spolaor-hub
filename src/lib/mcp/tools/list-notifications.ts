import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = {
  read?: boolean;
  tipo?: string;
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
};

export default defineTool({
  name: "list_notifications",
  title: "Listar notificações do usuário",
  description:
    "Lista as notificações do usuário autenticado. Não permite consultar notificações de terceiros (a RLS restringe a auth.uid()).",
  inputSchema: {
    read: z.boolean().optional().describe("true = somente lidas; false = somente não lidas; ausente = todas."),
    tipo: z.string().max(40).optional().describe("Filtrar por tipo de notificação."),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_notifications", async (
    { read, tipo, date_from, date_to, limit, offset },
    ctx,
    supabase,
  ) => {
    let q = supabase
      .from("notifications")
      .select("id, tipo, titulo, mensagem, link, lida, created_at", { count: "exact" })
      .eq("user_id", ctx.getUserId()!) // RLS + filtro explícito.
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (typeof read === "boolean") q = q.eq("lida", read);
    if (tipo) q = q.eq("tipo", tipo);
    if (date_from) q = q.gte("created_at", date_from);
    if (date_to) q = q.lte("created_at", date_to);

    const { data, error, count } = await q;
    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }

    const items = (data ?? []).map((n: any) => ({
      id: n.id,
      titulo: n.titulo,
      resumo: (n.mensagem ?? "").slice(0, 240),
      tipo: n.tipo,
      lida: n.lida,
      created_at: n.created_at,
      entidade: n.link ?? null,
    }));

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
