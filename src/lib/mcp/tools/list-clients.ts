import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_clients",
  title: "Listar clientes",
  description:
    "Lista os clientes visíveis ao usuário autenticado, respeitando as políticas de acesso do SC Central.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Máximo de clientes a retornar."),
    search: z.string().optional().describe("Busca por nome/razão social (opcional)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    let q = supabase.from("clients").select("*").order("created_at", { ascending: false }).limit(limit);
    if (search) q = q.ilike("razao_social", `%${search}%`);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { count: data?.length ?? 0, items: data ?? [] },
    };
  },
});
