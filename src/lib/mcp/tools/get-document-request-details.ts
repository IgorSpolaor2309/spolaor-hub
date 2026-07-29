import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { request_id: string };

/**
 * Detalhe de uma solicitação com histórico 1:N de arquivos.
 * A whitelist de campos é feita no banco (RPCs SECURITY DEFINER distintas por papel),
 * de modo que o agente nunca recebe storage_path nem campos administrativos indevidos.
 */
export default defineTool({
  name: "get_document_request_details",
  title: "Detalhar solicitação de documento",
  description:
    "Retorna o detalhe de uma solicitação: status, prazo, vínculos com checklist/processo e o histórico de versões de arquivo. Clientes recebem uma visão reduzida, sem observações internas.",
  inputSchema: {
    request_id: z.string().uuid().describe("ID da solicitação de documento."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("get_document_request_details", async ({ request_id }, ctx, supabase) => {
    const uid = ctx.getUserId()!;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isStaff = roleSet.has("admin") || roleSet.has("collaborator");

    const { data, error } = await supabase.rpc(
      isStaff ? "get_document_request_details_staff" : "get_document_request_details_client",
      { _request_id: request_id },
    );

    if (error) {
      return {
        result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true },
        count: 0,
      };
    }
    if (!data) {
      return {
        result: { content: [{ type: "text", text: "Solicitação não encontrada." }], isError: true },
        count: 0,
      };
    }

    const payload = data as Record<string, unknown>;
    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      },
      count: 1,
    };
  }),
});
