import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = {
  client_id?: string;
  status?: string;
  due_from?: string;
  due_to?: string;
  limit: number;
  offset: number;
};

export default defineTool({
  name: "list_tax_guides",
  title: "Listar guias tributárias",
  description:
    "Lista as guias tributárias (tax_guides) visíveis ao usuário autenticado. Nunca retorna URLs privadas permanentes de storage.",
  inputSchema: {
    client_id: z.string().uuid().optional(),
    status: z.string().max(40).optional(),
    due_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Vencimento inicial (YYYY-MM-DD)."),
    due_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Vencimento final (YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_tax_guides", async (
    { client_id, status, due_from, due_to, limit, offset },
    _ctx,
    supabase,
  ) => {
    let q = supabase
      .from("tax_guides")
      .select(
        `id, client_id, tipo, competencia, vencimento, valor, status,
         comprovante_path, comprovante_uploaded_at, created_at,
         clients:client_id(id, razao_social, nome_fantasia)`,
        { count: "exact" },
      )
      .is("deleted_at", null)
      .order("vencimento", { ascending: true })
      .range(offset, offset + limit - 1);

    if (client_id) q = q.eq("client_id", client_id);
    if (status) q = q.eq("status", status);
    if (due_from) q = q.gte("vencimento", due_from);
    if (due_to) q = q.lte("vencimento", due_to);

    const { data, error, count } = await q;
    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }

    const today = new Date().toISOString().slice(0, 10);
    const items = (data ?? []).map((r: any) => ({
      id: r.id,
      empresa: r.clients,
      tipo: r.tipo,
      competencia: r.competencia,
      vencimento: r.vencimento,
      valor: r.valor,
      status: r.status,
      possui_comprovante: Boolean(r.comprovante_path),
      comprovante_em: r.comprovante_uploaded_at,
      em_atraso: r.vencimento && r.vencimento < today && r.status !== "pago" && r.status !== "quitada",
      created_at: r.created_at,
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
