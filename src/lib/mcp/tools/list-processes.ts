import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { limit: number; offset: number; status?: string };

/**
 * Comportamento por papel (defesa em profundidade — não depende apenas de RLS):
 * - admin:        lista todos os processos (RLS permite; colunas explícitas, sem dados internos desnecessários).
 * - collaborator: lista apenas processos de clientes vinculados (filtro explícito por `client_id` além do RLS).
 * - client:       delega ao RPC `client_list_processes` (mesmo contrato do portal); nunca expõe motivo_espera/observacoes.
 * Nenhum papel: bloqueia.
 * Campos sensíveis (observacoes, motivo_espera, dados demo) NÃO são retornados por padrão.
 */

const STAFF_COLUMNS =
  "id, client_id, process_type_id, responsavel_id, status, prioridade, progresso, total_etapas, etapas_concluidas, data_abertura, prazo_final, data_conclusao, created_at";

export default defineTool({
  name: "list_processes",
  title: "Listar processos",
  description:
    "Lista processos visíveis ao usuário autenticado. Admin vê todos; colaborador vê apenas clientes vinculados; cliente vê apenas seus processos com dados públicos.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Máximo de processos a retornar."),
    offset: z.number().int().min(0).max(10000).default(0).describe("Deslocamento para paginação."),
    status: z.string().max(40).optional().describe("Filtrar por status (opcional)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("list_processes", async ({ limit, offset, status }, ctx, supabase) => {
    const userId = ctx.getUserId()!;

    // Descobrir papel(éis) do usuário para roteamento explícito.
    const { data: rolesData, error: rolesErr } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    if (rolesErr) {
      return { result: { content: [{ type: "text", text: sanitizeError(rolesErr) }], isError: true }, count: 0 };
    }
    const roles = new Set((rolesData ?? []).map((r) => (r as { role: string }).role));
    const isAdmin = roles.has("admin");
    const isCollaborator = roles.has("collaborator");
    const isClient = roles.has("client");

    if (!isAdmin && !isCollaborator && !isClient) {
      return {
        result: { content: [{ type: "text", text: "Papel do usuário não autorizado a listar processos." }], isError: true },
        count: 0,
      };
    }

    // ── Cliente: delega ao RPC do portal e mascara campos internos. ─────────
    if (isClient && !isAdmin && !isCollaborator) {
      const { data, error } = await supabase.rpc("client_list_processes");
      if (error) {
        return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
      }
      const all = (data ?? []) as Array<{
        id: string;
        client_id: string;
        empresa: string | null;
        tipo_nome: string | null;
        status: string;
        prazo_final: string | null;
        data_abertura: string | null;
        progresso_total: number | null;
        progresso_concluido: number | null;
        aguardando_minha_acao: boolean | null;
      }>;
      const filtered = status ? all.filter((p) => p.status === status) : all;
      const page = filtered.slice(offset, offset + limit).map((p) => ({
        id: p.id,
        client_id: p.client_id,
        empresa: p.empresa,
        tipo_nome: p.tipo_nome,
        status: p.status,
        prazo_final: p.prazo_final,
        data_abertura: p.data_abertura,
        progresso_total: p.progresso_total ?? 0,
        progresso_concluido: p.progresso_concluido ?? 0,
        aguardando_minha_acao: !!p.aguardando_minha_acao,
      }));
      const payload = { role: "client" as const, count: page.length, total: filtered.length, items: page };
      return {
        result: {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        },
        count: page.length,
      };
    }

    // ── Staff (admin / collaborator): consulta direta com colunas explícitas.
    let q = supabase
      .from("company_processes")
      .select(STAFF_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status) q = q.eq("status", status);

    // Colaborador: filtro EXPLÍCITO por clientes vinculados (não depende só da RLS).
    if (!isAdmin && isCollaborator) {
      const { data: links, error: linksErr } = await supabase
        .from("client_collaborators")
        .select("client_id")
        .eq("collaborator_id", userId);
      if (linksErr) {
        return { result: { content: [{ type: "text", text: sanitizeError(linksErr) }], isError: true }, count: 0 };
      }
      const ids = (links ?? []).map((r) => (r as { client_id: string }).client_id);
      if (ids.length === 0) {
        const payload = { role: "collaborator" as const, count: 0, total: 0, items: [] as unknown[] };
        return {
          result: {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload,
          },
          count: 0,
        };
      }
      q = q.in("client_id", ids);
    }

    const { data, error, count } = await q;
    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }
    const items = (data ?? []) as Array<Record<string, unknown>>;
    const payload = {
      role: isAdmin ? ("admin" as const) : ("collaborator" as const),
      count: items.length,
      total: count ?? null,
      items,
    };
    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      },
      count: items.length,
    };
  }),
});
