import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { client_id: string };

export default defineTool({
  name: "get_client_summary",
  title: "Resumo da empresa",
  description:
    "Retorna resumo de uma empresa (cliente) à qual o usuário autenticado possui acesso, respeitando as políticas do SC Central.",
  inputSchema: {
    client_id: z.string().uuid().describe("UUID da empresa (client_id)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("get_client_summary", async ({ client_id }, _ctx, supabase) => {
    // 1) Empresa (base) — RLS decide visibilidade.
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select(
        "id, razao_social, nome_fantasia, status, tipo, cidade, uf, cnpj, situacao_cadastral, created_at",
      )
      .eq("id", client_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (clientErr) {
      return { result: { content: [{ type: "text", text: sanitizeError(clientErr) }], isError: true }, count: 0 };
    }
    if (!client) {
      // Não diferenciar ausência de registro de bloqueio por RLS.
      return {
        result: { content: [{ type: "text", text: "Empresa não encontrada ou sem acesso." }], isError: true },
        count: 0,
      };
    }

    // 2) Dados fiscais (regime, tipo). RLS aplica.
    const fiscalP = supabase
      .from("client_fiscal_data")
      .select("regime_tributario, tipo_empresa")
      .eq("client_id", client_id)
      .maybeSingle();

    // 3) Colaboradores responsáveis permitidos.
    const collabsP = supabase
      .from("client_collaborators")
      .select("collaborator_id, collaborators(nome, email, cargo, departamento)")
      .eq("client_id", client_id);

    // 4) Contagens em paralelo (todas com RLS).
    const nowIso = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    const pendingP = supabase
      .from("pending_tasks")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .neq("status", "concluida")
      .neq("status", "cancelada");

    const processesP = supabase
      .from("company_processes")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .in("status", ["em_andamento", "aguardando", "aberto", "pendente"]);

    const requestsP = supabase
      .from("document_requests")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .is("deleted_at", null)
      .in("status", ["aguardando", "reenviar"]);

    const guidesP = supabase
      .from("tax_guides")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .is("deleted_at", null)
      .gte("vencimento", nowIso)
      .lte("vencimento", in30);

    const docsRecentP = supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString());

    const checklistTotalP = supabase
      .from("client_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .is("deleted_at", null);

    const checklistDoneP = supabase
      .from("client_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client_id)
      .is("deleted_at", null)
      .eq("status", "concluido");

    const [
      fiscal, collabs, pending, processes, requests, guides, docsRecent, chkTotal, chkDone,
    ] = await Promise.all([
      fiscalP, collabsP, pendingP, processesP, requestsP, guidesP, docsRecentP, checklistTotalP, checklistDoneP,
    ]);

    const responsaveis =
      (collabs.data ?? [])
        .map((r: any) => r?.collaborators)
        .filter(Boolean)
        .map((c: any) => ({ nome: c.nome, email: c.email, cargo: c.cargo, departamento: c.departamento }));

    const total = chkTotal.count ?? 0;
    const done = chkDone.count ?? 0;
    const progress = total > 0 ? Math.round((done / total) * 100) : null;

    const payload = {
      id: client.id,
      razao_social: client.razao_social,
      nome_fantasia: client.nome_fantasia,
      status: client.status,
      tipo_empresa: fiscal.data?.tipo_empresa ?? client.tipo ?? null,
      regime_tributario: fiscal.data?.regime_tributario ?? null,
      cidade: client.cidade,
      uf: client.uf,
      responsaveis,
      pendencias_abertas: pending.count ?? 0,
      processos_ativos: processes.count ?? 0,
      solicitacoes_pendentes: requests.count ?? 0,
      guias_proximas_vencimento: guides.count ?? 0,
      documentos_recentes: docsRecent.count ?? 0,
      checklist: { total, concluidos: done, progresso_pct: progress },
      // @deprecated Fase D2.2A — registro manual de interações desativado.
      // Campo mantido apenas por compatibilidade do contrato MCP; sempre [].
      // Será removido em uma revisão futura do contrato.
      ultimas_interacoes: [] as Array<never>,
    };

    return {
      result: {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      },
      count: 1,
    };
  }),
});
