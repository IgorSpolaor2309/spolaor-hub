import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit, sanitizeError } from "../audit";

type Input = { process_id: string };

export default defineTool({
  name: "get_process_details",
  title: "Detalhes do processo",
  description:
    "Retorna os detalhes de um processo (company_processes) visível ao usuário autenticado, respeitando as políticas da Digital SC. Cliente vê apenas informações liberadas no portal (visivel_cliente).",
  inputSchema: {
    process_id: z.string().uuid().describe("UUID do processo (company_processes.id)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: withMcpAudit<Input>("get_process_details", async ({ process_id }, ctx, supabase) => {
    // Descobrir papel do usuário (para modelar a resposta; RLS ainda aplica).
    const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", ctx.getUserId()!);
    const roles = (rolesData ?? []).map((r: any) => r.role as string);
    const isClient = roles.includes("client") && !roles.includes("admin") && !roles.includes("collaborator");

    const { data: proc, error } = await supabase
      .from("company_processes")
      .select(
        `id, client_id, status, prioridade, progresso, total_etapas, etapas_concluidas,
         data_abertura, prazo_final, data_conclusao, created_at, updated_at,
         motivo_espera, observacoes, responsavel_id, process_type_id,
         clients:client_id(id, razao_social, nome_fantasia)`,
      )
      .eq("id", process_id)
      .maybeSingle();

    if (error) {
      return { result: { content: [{ type: "text", text: sanitizeError(error) }], isError: true }, count: 0 };
    }
    if (!proc) {
      return {
        result: { content: [{ type: "text", text: "Processo não encontrado ou sem acesso." }], isError: true },
        count: 0,
      };
    }

    // Etapas (com requisitos).
    const stepsSelect = isClient
      ? "id, ordem, nome_publico, descricao_publica, status, prazo, data_conclusao, visivel_cliente"
      : "id, ordem, nome, descricao, departamento, status, prazo, data_inicio, data_conclusao, obrigatoria, exige_documento, observacoes, visivel_cliente, responsavel_id";

    let stepsQuery = supabase
      .from("company_process_steps")
      .select(stepsSelect)
      .eq("company_process_id", process_id)
      .order("ordem", { ascending: true });
    if (isClient) stepsQuery = stepsQuery.eq("visivel_cliente", true);
    const { data: steps, error: stepsErr } = await stepsQuery;
    if (stepsErr) {
      return { result: { content: [{ type: "text", text: sanitizeError(stepsErr) }], isError: true }, count: 0 };
    }

    const stepIds = (steps ?? []).map((s: any) => s.id);
    let requirements: any[] = [];
    if (stepIds.length > 0) {
      const reqSelect = isClient
        ? "id, company_process_step_id, nome_publico, descricao_publica, obrigatorio, ordem, fulfilled_at, visivel_cliente"
        : "id, company_process_step_id, nome, descricao, observacao, obrigatorio, ordem, fulfilled_at, visivel_cliente";
      let reqQ = supabase
        .from("company_process_step_requirements")
        .select(reqSelect)
        .in("company_process_step_id", stepIds)
        .order("ordem", { ascending: true });
      if (isClient) reqQ = reqQ.eq("visivel_cliente", true);
      const { data: reqData, error: reqErr } = await reqQ;
      if (reqErr) {
        return { result: { content: [{ type: "text", text: sanitizeError(reqErr) }], isError: true }, count: 0 };
      }
      requirements = reqData ?? [];
    }

    // Buscas auxiliares (tipo do processo e responsável) — evitar depender de FK PostgREST.
    const [typeRes, respRes] = await Promise.all([
      (proc as any).process_type_id
        ? supabase.from("process_types").select("id, nome, categoria").eq("id", (proc as any).process_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
      !isClient && (proc as any).responsavel_id
        ? supabase.from("profiles").select("id, full_name, email").eq("id", (proc as any).responsavel_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const payload = {
      id: proc.id,
      empresa: (proc as any).clients,
      tipo: typeRes.data,
      status: proc.status,
      prioridade: proc.prioridade,
      progresso: proc.progresso,
      etapas_concluidas: proc.etapas_concluidas,
      total_etapas: proc.total_etapas,
      data_abertura: proc.data_abertura,
      prazo_final: proc.prazo_final,
      data_conclusao: proc.data_conclusao,
      responsavel: isClient ? null : respRes.data ?? null,
      motivo_espera: isClient ? null : proc.motivo_espera,
      observacoes: isClient ? null : proc.observacoes,
      etapas: (steps ?? []).map((s: any) => ({
        ...s,
        requisitos: requirements.filter((r) => r.company_process_step_id === s.id),
      })),
      papel_usuario: isClient ? "client" : roles.includes("admin") ? "admin" : "collaborator",
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
