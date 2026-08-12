import { defineTool } from "@lovable.dev/mcp-js";
import { withMcpAudit, sanitizeError } from "../audit";

export default defineTool({
  name: "whoami",
  title: "Identidade do usuário conectado",
  description:
    "Retorna o perfil e o papel (admin, collaborator, client) do usuário da Digital SC autenticado nesta sessão MCP.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit("whoami", async (_input, ctx, supabase) => {
    const userId = ctx.getUserId()!;
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, status").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (profileRes.error) {
      return { result: { content: [{ type: "text", text: sanitizeError(profileRes.error) }], isError: true }, count: 0 };
    }
    const roleList = (rolesRes.data ?? []).map((r: { role: string }) => r.role);
    const role =
      roleList.includes("admin") ? "admin" :
      roleList.includes("collaborator") ? "collaborator" :
      roleList.includes("client") ? "client" : null;
    const payload = { userId, email: ctx.getUserEmail(), profile: profileRes.data, role, roles: roleList };
    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      },
      count: 1,
    };
  }),
});
