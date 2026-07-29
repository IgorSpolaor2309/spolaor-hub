import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = {
  client_id?: string;
  competencia?: string;
  tipo?: string;
  limit: number;
  offset: number;
};

/**
 * Whitelist explícita de campos devolvidos ao agente.
 * NUNCA incluir: storage_path, observacoes, uploaded_by, deleted_* ou demo_batch_id.
 */
const STAFF_FIELDS =
  "id, client_id, nome, tipo, competencia, status, data_validade, categoria_validade, created_at, updated_at";

export default defineTool({
  name: "list_documents",
  title: "Listar documentos",
  description:
    "Lista documentos arquivados de uma empresa (nome, tipo, competência, validade). Nunca devolve caminho de arquivo, link direto nem observações internas.",
  inputSchema: {
    client_id: z
      .string()
      .uuid()
      .optional()
      .describe("Filtrar por empresa (obrigatório para clientes)."),
    competencia: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe("Competência no formato AAAA-MM."),
    tipo: z.string().max(60).optional().describe("Filtrar por tipo de documento — apenas staff."),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>(
    "list_documents",
    async ({ client_id, competencia, tipo, limit, offset }, ctx, supabase) => {
      const uid = ctx.getUserId()!;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role));
      const isStaff = roleSet.has("admin") || roleSet.has("collaborator");

      if (!isStaff) {
        if (!client_id) {
          return {
            result: {
              content: [{ type: "text", text: "client_id é obrigatório para clientes." }],
              isError: true,
            },
            count: 0,
          };
        }
        const { data, error } = await supabase.rpc("client_list_documents", {
          p_client_id: client_id,
          p_competencia: competencia ?? null,
          p_limit: limit,
          p_offset: offset,
        });
        if (error) {
          return {
            result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true },
            count: 0,
          };
        }
        const items = (data ?? []).map((d: any) => ({
          id: d.id,
          client_id: d.client_id,
          nome: d.nome,
          tipo: d.tipo,
          competencia: d.competencia,
          status: d.status,
          data_validade: d.data_validade,
          categoria_validade: d.categoria_validade,
          vencido: Boolean(d.vencido),
          vencendo_em_30_dias: Boolean(d.vencendo),
          created_at: d.created_at,
        }));
        const payload = { count: items.length, total: null, items };
        return {
          result: {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
          },
          count: items.length,
        };
      }

      let q = supabase
        .from("documents")
        .select(`${STAFF_FIELDS}, clients:client_id(id, razao_social, nome_fantasia)`, {
          count: "exact",
        })
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (client_id) q = q.eq("client_id", client_id);
      if (competencia) q = q.eq("competencia", competencia);
      if (tipo) q = q.eq("tipo", tipo);

      const { data, error, count } = await q;
      if (error) {
        return {
          result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true },
          count: 0,
        };
      }

      const hoje = new Date().toISOString().slice(0, 10);
      const items = (data ?? []).map((d: any) => ({
        id: d.id,
        empresa: d.clients,
        nome: d.nome,
        tipo: d.tipo,
        competencia: d.competencia,
        status: d.status,
        data_validade: d.data_validade,
        categoria_validade: d.categoria_validade,
        vencido: Boolean(d.data_validade && d.data_validade < hoje),
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));

      const payload = { count: items.length, total: count ?? null, items };
      return {
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        },
        count: items.length,
      };
    },
  ),
});
