import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = {
  client_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
};

export default defineTool({
  name: "list_document_requests",
  title: "Listar solicitações de documento",
  description:
    "Lista solicitações de documentos visíveis ao usuário. Clientes recebem apenas campos públicos (sem observações internas nem campos administrativos).",
  inputSchema: {
    client_id: z.string().uuid().optional().describe("Filtrar por empresa (obrigatório para clientes)."),
    status: z.string().max(40).optional().describe("Filtrar por status (opcional)."),
    date_from: z.string().datetime().optional().describe("Data inicial ISO (created_at) — apenas staff."),
    date_to: z.string().datetime().optional().describe("Data final ISO (created_at) — apenas staff."),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_document_requests", async (
    { client_id, status, date_from, date_to, limit, offset },
    ctx,
    supabase,
  ) => {
    // Detecta papel do chamador
    const uid = ctx.getUserId()!;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isStaff = roleSet.has("admin") || roleSet.has("collaborator");

    if (!isStaff) {
      // Cliente: RPC segura obrigatória, exige client_id.
      if (!client_id) {
        return {
          result: { content: [{ type: "text", text: "client_id é obrigatório para clientes." }], isError: true },
          count: 0,
        };
      }
      const { data, error } = await supabase.rpc("client_list_document_requests", {
        p_client_id: client_id,
        p_status: status ?? null,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) {
        return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
      }
      const items = (data ?? []).map((r: any) => ({
        id: r.id,
        client_id: r.client_id,
        titulo: r.titulo,
        categoria: r.categoria,
        tipo_solicitacao: r.tipo_solicitacao,
        departamento: r.departamento,
        urgencia: r.urgencia,
        status: r.status,
        competencia: r.competencia,
        prazo: r.prazo,
        possui_anexo: Boolean(r.possui_anexo),
        created_at: r.created_at,
        updated_at: r.updated_at,
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

    // Staff: leitura direta com RLS aplicada.
    let q = supabase
      .from("document_requests")
      .select(
        `id, client_id, titulo, categoria, tipo_solicitacao, departamento, urgencia,
         status, competencia, prazo, document_id, attachment_final_name, created_at, updated_at,
         clients:client_id(id, razao_social, nome_fantasia)`,
        { count: "exact" },
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (client_id) q = q.eq("client_id", client_id);
    if (status) q = q.eq("status", status);
    if (date_from) q = q.gte("created_at", date_from);
    if (date_to) q = q.lte("created_at", date_to);

    const { data, error, count } = await q;
    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }

    const items = (data ?? []).map((r: any) => ({
      id: r.id,
      empresa: r.clients,
      titulo: r.titulo,
      categoria: r.categoria,
      tipo_solicitacao: r.tipo_solicitacao,
      departamento: r.departamento,
      urgencia: r.urgencia,
      status: r.status,
      competencia: r.competencia,
      prazo: r.prazo,
      possui_anexo: Boolean(r.document_id || r.attachment_final_name),
      proxima_acao:
        r.status === "pendente" ? "aguardando envio do cliente"
        : r.status === "aguardando" ? "aguardando revisão da contabilidade"
        : r.status === "em_andamento" ? "em processamento"
        : r.status === "concluida" ? "nenhuma"
        : "verificar",
      created_at: r.created_at,
      updated_at: r.updated_at,
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
