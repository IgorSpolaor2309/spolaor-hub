import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { z } from "zod";

const ContractModelSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  version: z.number().optional(),
  status: z.enum(['rascunho', 'ativo', 'inativo']).optional(),
  content: z.string(),
  internal_notes: z.string().optional().nullable()
});

export const getContractModels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contract_models")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

export const saveContractModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ContractModelSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    const { supabase, userId } = context;

    // 1. Verify administrative role via security-definer function
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: userId,
      _role: 'admin'
    });

    if (roleError) {
      console.error("Error checking role:", roleError);
      throw new Error("Erro ao verificar permissões de acesso.");
    }

    if (!isAdmin) {
      throw new Error("Acesso negado: Apenas administradores podem gerenciar modelos de contrato.");
    }

    let result;
    if (id) {
      result = await supabase
        .from("contract_models")
        .update({
          ...payload,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("contract_models")
        .insert({
          ...payload,
          created_by: userId,
          updated_by: userId
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error("Database error saving contract model:", result.error);
      if (result.error.code === '42501') {
        throw new Error("Permissão negada no banco de dados. Verifique as políticas RLS.");
      }
      throw result.error;
    }
    
    return result.data;
  });

export const getActiveContractModel = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from("contract_models")
      .select("*")
      .eq("status", "ativo")
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const getGeneratedContracts = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ prospectId: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    let query = supabase.from("generated_contracts").select(`
      *,
      prospect:prospect_id (contact_name, contact_email, cnpj),
      model:model_id (name, version)
    `);
    
    if (data.prospectId) {
      query = query.eq("prospect_id", data.prospectId);
    }

    const { data: contracts, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return contracts;
  });

export const generateContract = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ prospectId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    console.log(`[CONTRACT_GENERATION_START] Prospect: ${data.prospectId}`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { INSTITUCIONAL_DIGITAL_SC } = await import("./institucional.server");

    // 1. Get Prospect Data with Plan details
    const { data: prospect, error: pError } = await supabaseAdmin
      .from("commercial_prospects")
      .select("*, plan:plan_id (*)")
      .eq("id", data.prospectId)
      .single();
    
    if (pError || !prospect) throw new Error("Prospect não encontrado");

    // 2. Fetch Services for the plan
    const { data: planServices } = await supabaseAdmin
      .from("plan_services")
      .select("*, service:service_id (nome, descricao)")
      .eq("plan_id", prospect.plan_id || "");

    const planServicesList = planServices?.map(ps => (ps.service as any)?.nome).filter(Boolean).join(", ") || "";

    // 2.1. Determine monthly fee and setup fee correctly
    const monthlyFee = prospect.final_value || 0;
    const setupFee = prospect.original_value > monthlyFee ? (prospect.original_value - monthlyFee) : 0;
    // Note: In our current prospect model, original_value often includes setup + first month
    // or we might need to adjust this logic based on how the total was calculated in CheckoutView.
    // For now, if original_value is significantly higher, we assume the difference is setup.
    // If not, we check proposal.
    const finalSetupValue = proposal?.setup_value ?? setupFee;

    // 3. Fetch Lead Data
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("email", prospect.contact_email || "")
      .maybeSingle();

    // 4. Get Active Model
    const { data: model, error: mError } = await supabaseAdmin
      .from("contract_models")
      .select("*")
      .eq("status", "ativo")
      .single();
    
    if (mError || !model) throw new Error("Nenhum modelo de contrato ativo encontrado");

    // 5. Get Proposal Snapshot if personalized
    const { data: proposal } = await supabaseAdmin
      .from("custom_proposals")
      .select("*")
      .eq("lead_id", lead?.id || "")
      .eq("status", "aceita")
      .maybeSingle();

    // 6. Base Placeholders Mapping
    const journeyData = (lead?.journey_data as any) || (prospect?.ai_extracted_data as any) || {};
    const extracted = (journeyData?.extracted ?? {}) as Record<string, any>;
    
    const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formatCNPJ = (val: string) => {
      const clean = val.replace(/\D/g, '');
      if (clean.length !== 14) return val;
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    };

    const setupValue = proposal?.setup_value ?? 0;
    const finalPlanName = prospect.plan?.nome || "Personalizado";
    
    const placeholders: Record<string, string> = {
      "{{razao_social}}": extracted.razao_social || extracted.company_name || prospect.contact_name || lead?.name || "",
      "{{cnpj}}": formatCNPJ(prospect.cnpj || lead?.cnpj || extracted.cnpj || ""),
      "{{email}}": prospect.contact_email || lead?.email || extracted.email || "",
      "{{telefone}}": prospect.contact_phone || lead?.phone || extracted.phone || "",
      "{{endereco}}": extracted.address || extracted.logradouro || lead?.city || "",
      "{{natureza_juridica}}": extracted.legal_nature || extracted.natureza_juridica || "",
      "{{nome_responsavel}}": extracted.representative_name || extracted.responsavel || prospect.contact_name || "",
      "{{cpf_responsavel}}": extracted.representative_cpf || extracted.cpf || "",
      "{{plano}}": finalPlanName,
      "{{valor_mensal}}": brl(monthlyFee),
      "{{valor_implantacao}}": finalSetupValue > 0 ? brl(finalSetupValue) : "R$ 0,00",
      "{{dia_vencimento}}": "10",
      "{{competencia_inicial}}": new Date().toLocaleDateString("pt-BR", { month: 'long', year: 'numeric' }),
      "{{limite_faturamento}}": prospect.plan?.limite_faturamento 
        ? `Até ${brl(prospect.plan.limite_faturamento).replace(',00', '')} por mês`
        : (proposal?.max_revenue ? `Até ${brl(proposal.max_revenue).replace(',00', '')} por mês` : "Conforme Proposta"),
      "{{estrutura_incluida}}": "Atendimento Digital via WhatsApp e Plataforma",
      "{{vigencia}}": "12 meses",
      "{{reajuste}}": model.internal_notes?.includes("IPCA") ? "IPCA/IBGE anual" : "IGP-M/FGV anual",
      "{{data_contratacao}}": new Date().toLocaleDateString("pt-BR"),
      "{{crc_sp}}": INSTITUCIONAL_DIGITAL_SC.crc_sp,
      "{{cidade_assinatura}}": INSTITUCIONAL_DIGITAL_SC.cidade_assinatura,
      "{{representante_contratada}}": INSTITUCIONAL_DIGITAL_SC.representante,
      "{{cpf_representante_contratada}}": INSTITUCIONAL_DIGITAL_SC.cpf_representante,
    };

    if (proposal) {
      const services = (proposal.services as any[]) || [];
      const included = services.filter((s: any) => s.included).map((s: any) => s.name).join(", ");
      const extras = services.filter((s: any) => !s.included).map((s: any) => s.name).join(", ");
      placeholders["{{servicos_incluidos}}"] = included || planServicesList || "Serviços Contábeis padrão conforme catálogo";
      placeholders["{{servicos_extras}}"] = extras || "Consultoria Especializada, Auditoria Retroativa";
      placeholders["{{descontos}}"] = brl(proposal.discount_value || 0);
      placeholders["{{condicoes_especiais}}"] = (proposal.special_conditions as string) || "Nenhuma";
    } else {
      placeholders["{{servicos_incluidos}}"] = planServicesList || "Serviços Contábeis padrão conforme catálogo";
      placeholders["{{servicos_extras}}"] = "Consultoria Especializada, Auditoria Retroativa";
      placeholders["{{descontos}}"] = brl(prospect.discount_value || 0);
      placeholders["{{condicoes_especiais}}"] = "Nenhuma";
    }

    const mandatory = {
      "razao_social": placeholders["{{razao_social}}"],
      "cnpj": placeholders["{{cnpj}}"],
      "email": placeholders["{{email}}"],
      "endereco": placeholders["{{endereco}}"],
      "nome_responsavel": placeholders["{{nome_responsavel}}"],
      "cpf_responsavel": placeholders["{{cpf_responsavel}}"]
    };

    const missingFields = Object.entries(mandatory)
      .filter(([_, value]) => !value || value === "A informar" || value === "A definir")
      .map(([key]) => key);

    let finalContent = model.content;
    Object.entries(placeholders).forEach(([key, value]) => {
      const safeValue = String(value || "A definir");
      finalContent = finalContent.replace(new RegExp(key, 'g'), safeValue);
    });

    const { data: generated, error: gError } = await supabaseAdmin
      .from("generated_contracts")
      .insert({
        prospect_id: prospect.id,
        model_id: model.id,
        version: model.version,
        content_snapshot: finalContent,
        status: 'contrato_gerado',
        validation_errors: missingFields.length > 0 ? missingFields : null,
        metadata: { placeholders } // Store placeholders for reference in UI
      } as any)
      .select().single();

    if (gError) {
      console.error("[CONTRACT_GENERATION_ERROR]", gError);
      throw gError;
    }

    console.log(`[CONTRACT_CREATED] ID: ${generated.id}, Errors: ${missingFields.length}`);
    return {
      ...generated,
      missingFields,
      isInstitucionalDemo: !!(INSTITUCIONAL_DIGITAL_SC as any).is_demo
    };
  });


export const getContractForReview = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ contractId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    console.log(`[getContractForReview] Fetching contract: ${data.contractId}`);
    
    const { data: contract, error } = await supabaseAdmin
      .from("generated_contracts")
      .select(`
        *,
        prospect:prospect_id (
          contact_name,
          cnpj,
          final_value,
          plan:plan_id (nome)
        )
      `)
      .eq("id", data.contractId)
      .maybeSingle();

    if (error) {
      console.error("[getContractForReview] Database error:", error);
      throw new Error("erro_banco");
    }

    if (!contract) {
      console.warn(`[getContractForReview] Contract not found: ${data.contractId}`);
      throw new Error("not_found");
    }

    if (!contract.content_snapshot) {
      console.warn(`[getContractForReview] Missing snapshot for contract: ${data.contractId}`);
      throw new Error("missing_snapshot");
    }

    return contract;
  });
