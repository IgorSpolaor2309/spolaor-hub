import { defineTool } from "@lovable.dev/mcp-js";
import { withMcpAudit } from "../audit";

export default defineTool({
  name: "get_dashboard_summary",
  title: "Resumo do dashboard",
  description:
    "Retorna um resumo operacional adaptado ao papel do usuário autenticado (admin, colaborador ou cliente). Todas as contagens respeitam a RLS existente.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit("get_dashboard_summary", async (_input, ctx, supabase) => {
    const userId = ctx.getUserId()!;
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (rolesData ?? []).map((r: any) => r.role as string);
    const role =
      roles.includes("admin") ? "admin" :
      roles.includes("collaborator") ? "collaborator" :
      roles.includes("client") ? "client" : "unknown";

    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const head = (t: string) => supabase.from(t).select("id", { count: "exact", head: true });

    const empresasP = head("clients").is("deleted_at", null);
    const pendAbertasP = head("pending_tasks")
      .neq("status", "concluida")
      .neq("status", "cancelada");
    const pendVencidasP = head("pending_tasks")
      .neq("status", "concluida")
      .neq("status", "cancelada")
      .lt("prazo", today);
    const procAtivosP = head("company_processes")
      .in("status", ["em_andamento", "aguardando", "aberto", "pendente"]);
    const procAtrasadosP = head("company_processes")
      .in("status", ["em_andamento", "aguardando", "aberto", "pendente"])
      .lt("prazo_final", today);
    const solicP = head("document_requests")
      .is("deleted_at", null)
      .in("status", ["pendente", "aguardando", "em_andamento"]);
    const guiasP = head("tax_guides")
      .is("deleted_at", null)
      .gte("vencimento", today)
      .lte("vencimento", in30);
    const checkPendP = head("client_checklist_items")
      .is("deleted_at", null)
      .eq("status", "pendente");
    const notifNaoLidasP = head("notifications")
      .eq("user_id", userId)
      .eq("lida", false);

    const [empresas, pendAbertas, pendVencidas, procAtivos, procAtrasados, solic, guias, checkPend, notif] = await Promise.all([
      empresasP, pendAbertasP, pendVencidasP, procAtivosP, procAtrasadosP, solicP, guiasP, checkPendP, notifNaoLidasP,
    ]);

    const base = {
      papel: role,
      empresas_acessiveis: empresas.count ?? 0,
      pendencias_abertas: pendAbertas.count ?? 0,
      pendencias_vencidas: pendVencidas.count ?? 0,
      processos_ativos: procAtivos.count ?? 0,
      processos_atrasados: procAtrasados.count ?? 0,
      solicitacoes_pendentes: solic.count ?? 0,
      guias_proximas_vencimento: guias.count ?? 0,
      checklists_pendentes: checkPend.count ?? 0,
      notificacoes_nao_lidas: notif.count ?? 0,
    };

    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(base, null, 2) }],
        structuredContent: base,
      },
      count: 1,
    };
  }),
});
