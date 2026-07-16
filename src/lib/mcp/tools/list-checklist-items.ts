import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = {
  client_id?: string;
  competence?: string;
  status?: "pendente" | "recebido" | "concluido" | "cancelado";
  limit: number;
  offset: number;
};

export default defineTool({
  name: "list_checklist_items",
  title: "Listar itens de checklist",
  description:
    "Lista os itens de checklist (client_checklist_items) visíveis ao usuário autenticado. Usa exclusivamente os status oficiais: pendente, recebido, concluido, cancelado.",
  inputSchema: {
    client_id: z.string().uuid().optional(),
    competence: z.string().max(20).optional().describe("Competência (ex: 2026-07)."),
    status: z.enum(["pendente", "recebido", "concluido", "cancelado"]).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_checklist_items", async (
    { client_id, competence, status, limit, offset },
    _ctx,
    supabase,
  ) => {
    let q = supabase
      .from("client_checklist_items")
      .select(
        `id, client_id, titulo, categoria, competencia, status, prazo, origem, responsavel_profile_id,
         created_at, updated_at,
         clients:client_id(id, razao_social, nome_fantasia)`,
        { count: "exact" },
      )
      .is("deleted_at", null)
      .order("prazo", { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (client_id) q = q.eq("client_id", client_id);
    if (competence) q = q.eq("competencia", competence);
    if (status) q = q.eq("status", status);

    const { data, error, count } = await q;
    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }

    // Buscar nomes dos responsáveis em lote (evita N+1).
    const respIds = Array.from(
      new Set((data ?? []).map((r: any) => r.responsavel_profile_id).filter(Boolean)),
    ) as string[];
    let profMap: Record<string, { full_name: string | null; email: string | null }> = {};
    if (respIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", respIds);
      profMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
    }

    const items = (data ?? []).map((r: any) => ({
      id: r.id,
      empresa: r.clients,
      titulo: r.titulo,
      categoria: r.categoria,
      competencia: r.competencia,
      status: r.status,
      prazo: r.prazo,
      origem: r.origem,
      responsavel: r.responsavel_profile_id ? profMap[r.responsavel_profile_id] ?? null : null,
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
