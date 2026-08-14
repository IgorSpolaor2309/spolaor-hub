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
  .inputValidator((data) => z.object({ 
    prospectId: z.string().optional(),
    contractingId: z.string().optional() 
  }).parse(data))
  .handler(async ({ data }) => {
    console.log(`[GENERATE_CONTRACT_INPUT] prospectId: ${data.prospectId}, contractingId: ${data.contractingId}`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { INSTITUCIONAL_DIGITAL_SC } = await import("./institucional.server");

    let prospect: any = null;
    let contracting: any = null;

    // 1. Resolve Contracting and Prospect
    if (data.contractingId) {
      const { data: cData, error: cError } = await supabaseAdmin
        .from("commercial_contracts")
        .select("*, prospect:prospect_id (*)")
        .eq("id", data.contractingId)
        .maybeSingle();
      
      if (cError) throw new Error(`Erro ao buscar contratação: ${cError.message}`);
      if (!cData) throw new Error("Contratação não encontrada.");
      
      contracting = cData;
      prospect = cData.prospect;
    } else if (data.prospectId) {
      const { data: pData, error: pError } = await supabaseAdmin
        .from("commercial_prospects")
        .select("*")
        .eq("id", data.prospectId)
        .maybeSingle();
      
      if (pError) throw new Error(`Erro ao buscar prospect: ${pError.message}`);
      if (!pData) throw new Error("Prospect não encontrado.");
      
      prospect = pData;

      // Try to find an existing contract for this prospect
      const { data: cData } = await supabaseAdmin
        .from("commercial_contracts")
        .select("*")
        .eq("prospect_id", prospect.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      contracting = cData;
    }

    if (!prospect) {
       throw new Error("Não foi possível identificar o Prospect para esta geração.");
    }

    // Ensure we have a plan
    const planId = prospect.plan_id || contracting?.plan_id;
    if (!planId) throw new Error("Esta contratação não possui um plano vinculado.");

    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("id", planId)
      .single();
    
    prospect.plan = plan;

    // 2. Fetch Lead Data
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("email", prospect.contact_email || "")
      .maybeSingle();

    // 3. Fetch Services for the plan
    const { data: planServices } = await supabaseAdmin
      .from("plan_services")
      .select("*, service:service_id (nome, descricao)")
      .eq("plan_id", prospect.plan_id || "");

    const planServicesList = planServices?.map(ps => (ps.service as any)?.nome).filter(Boolean).join(", ") || "";

    // 4. Check for existing contract (REGENERATION LOGIC)
    const { data: existingContract } = await supabaseAdmin
      .from("generated_contracts")
      .select("id, status, content_snapshot, metadata")
      .eq("prospect_id", prospect.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingContract) {
      const status = existingContract.status;
      if (status === 'contrato_enviado' || status === 'contrato_assinado') {
        console.warn(`[GENERATE_CONTRACT] Blocked regeneration for status: ${status}`);
        return {
          success: false,
          error: "O contrato já foi enviado ou assinado e não pode ser regenerado.",
          contractId: existingContract.id
        };
      }
      console.log(`[GENERATE_CONTRACT] Regenerating contract ${existingContract.id} (status: ${status})`);
    }

    // 5. Get Active Model
    const { data: model, error: mError } = await supabaseAdmin
      .from("contract_models")
      .select("*")
      .eq("status", "ativo")
      .single();
    
    if (mError || !model) throw new Error("Nenhum modelo de contrato ativo encontrado");

    // 6. Get Proposal Snapshot if personalized
    const { data: proposal } = await supabaseAdmin
      .from("custom_proposals")
      .select("*")
      .eq("lead_id", lead?.id || "")
      .eq("status", "aceita")
      .maybeSingle();

    // 7. Base Data Structuring (PLACEHOLDER MAPPING IMPROVEMENT)
    const journeyData = (lead?.journey_data as any) || (prospect?.ai_extracted_data as any) || {};
    const extracted = (journeyData?.extracted ?? {}) as Record<string, any>;
    
    // contractData centralizer for placeholders
    const contractData = {
      razao_social: extracted.razao_social || extracted.company_name || contracting?.contract_data?.razao_social || lead?.name || "A informar",
      cnpj: prospect.cnpj || lead?.cnpj || extracted.cnpj || contracting?.contract_data?.cnpj || "00000000000000",
      endereco: extracted.address || extracted.logradouro || contracting?.contract_data?.endereco || lead?.city || "A informar",
      email: prospect.contact_email || lead?.email || extracted.email || contracting?.contract_data?.email || "A informar",
      telefone: prospect.contact_phone || lead?.phone || extracted.phone || contracting?.contract_data?.telefone || "A informar",
      natureza_juridica: extracted.legal_nature || extracted.natureza_juridica || contracting?.contract_data?.natureza_juridica || "A informar",
      nome_responsavel: extracted.representative_name || extracted.responsavel || lead?.name || prospect.contact_name || contracting?.contract_data?.nome_responsavel || "A informar",
      cpf_responsavel: extracted.representative_cpf || extracted.cpf || contracting?.contract_data?.cpf_responsavel || "00000000000",
    };

    // Correct Razão Social rule: Never use contact_name as company name if we have a real company name or CNPJ
    if (prospect.cnpj || lead?.cnpj || extracted.cnpj) {
       if (contractData.razao_social === prospect.contact_name || contractData.razao_social === lead?.name) {
         if (!extracted.razao_social && !extracted.company_name) {
            // Keep it as "A informar" to avoid using contact name for company
            contractData.razao_social = "A informar (Razão Social)";
         }
       }
    }

    console.log(`CONTRACT_DATA_RAZAO_SOCIAL: ${contractData.razao_social}`);
    console.log(`CONTRACT_DATA_ENDERECO: ${contractData.endereco}`);
    console.log(`CONTRACT_DATA_RESPONSAVEL: ${contractData.nome_responsavel}`);
    console.log(`CONTRACT_DATA_CPF: ${contractData.cpf_responsavel}`);

    const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const formatCNPJ = (val: string) => {
      const clean = val.replace(/\D/g, '');
      if (clean.length !== 14) return val;
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    };

    const monthlyFee = contracting?.final_value || prospect.final_value || 0;
    const origValue = contracting?.plan_value || prospect.original_value || 0;
    const setupFee = origValue > monthlyFee ? (origValue - monthlyFee) : 0;
    const finalSetupValue = (proposal as any)?.setup_value ?? setupFee;
    const finalPlanName = prospect.plan?.nome || "Personalizado";

    const placeholders: Record<string, string> = {
      "{{razao_social}}": contractData.razao_social,
      "{{cnpj}}": formatCNPJ(contractData.cnpj),
      "{{email}}": contractData.email,
      "{{telefone}}": contractData.telefone,
      "{{endereco}}": contractData.endereco,
      "{{natureza_juridica}}": contractData.natureza_juridica,
      "{{nome_responsavel}}": contractData.nome_responsavel,
      "{{cpf_responsavel}}": contractData.cpf_responsavel,
      "{{plano}}": finalPlanName,
      "{{valor_mensal}}": brl(monthlyFee),
      "{{valor_implantacao}}": finalSetupValue > 0 ? brl(finalSetupValue) : "Isento",
      "{{dia_vencimento}}": "10",
      "{{competencia_inicial}}": new Date().toLocaleDateString("pt-BR", { month: 'long', year: 'numeric' }),
      "{{limite_faturamento}}": prospect.plan?.limite_faturamento 
        ? `Até ${brl(prospect.plan.limite_faturamento).replace(',00', '')} por mês`
        : (proposal?.max_revenue ? `Até ${brl(proposal.max_revenue).replace(',00', '')} por mês` : "Conforme Proposta"),
      "{{estrutura_incluida}}": "Atendimento Digital via WhatsApp e Plataforma",
      "{{vigencia}}": "12 meses",
      "{{reajuste}}": "IPCA/IBGE anual",
      "{{data_contratacao}}": new Date().toLocaleDateString("pt-BR"),
      "{{crc_sp}}": INSTITUCIONAL_DIGITAL_SC.crc_sp,
      "{{cidade_assinatura}}": INSTITUCIONAL_DIGITAL_SC.cidade_assinatura,
      "{{representante_contratada}}": INSTITUCIONAL_DIGITAL_SC.representante,
      "{{cpf_representante_contratada}}": INSTITUCIONAL_DIGITAL_SC.cpf_representante,
      "{{contratada_razao_social}}": INSTITUCIONAL_DIGITAL_SC.razao_social,
      "{{contratada_cnpj}}": INSTITUCIONAL_DIGITAL_SC.cnpj,
      "{{contratada_endereco}}": INSTITUCIONAL_DIGITAL_SC.endereco,
    };

    // Services Mapping
    if (proposal) {
      const services = (proposal.services as any[]) || [];
      const included = services.filter((s: any) => s.included).map((s: any) => s.name).join(", ");
      const selectedExtraIds = (prospect.extra_service_ids as string[]) || [];
      const { data: dbExtraServices } = await supabaseAdmin
        .from("services")
        .select("nome")
        .in("id", selectedExtraIds);
        
      const extras = dbExtraServices?.map(s => s.nome).join(", ") || "";
      placeholders["{{servicos_incluidos}}"] = included || planServicesList || "Serviços Contábeis padrão conforme catálogo";
      placeholders["{{servicos_extras}}"] = extras || "Consultoria Especializada, Auditoria Retroativa";
      placeholders["{{descontos}}"] = brl(proposal.discount_value || 0);
      placeholders["{{condicoes_especiais}}"] = (proposal.special_conditions as string) || "Nenhuma";
    } else {
      placeholders["{{servicos_incluidos}}"] = planServicesList || "Serviços Contábeis padrão conforme catálogo";
      const selectedExtraIds = (prospect.extra_service_ids as string[]) || [];
      const { data: dbExtraServices } = await supabaseAdmin
        .from("services")
        .select("nome")
        .in("id", selectedExtraIds);
        
      const extras = dbExtraServices?.map(s => s.nome).join(", ") || "";
      placeholders["{{servicos_extras}}"] = extras || "Consultoria Especializada, Auditoria Retroativa";
      placeholders["{{descontos}}"] = brl(prospect.discount_value || 0);
      placeholders["{{condicoes_especiais}}"] = "Nenhuma";
    }

    // Validation Check
    const mandatory = {
      "razao_social": placeholders["{{razao_social}}"],
      "cnpj": placeholders["{{cnpj}}"],
      "email": placeholders["{{email}}"],
      "endereco": placeholders["{{endereco}}"],
      "nome_responsavel": placeholders["{{nome_responsavel}}"],
      "cpf_responsavel": placeholders["{{cpf_responsavel}}"],
    };

    const missingFields = Object.entries(mandatory)
      .filter(([key, value]) => {
        if (!value || value === "A informar" || value === "A informar (Razão Social)" || value === "" || value.includes("...")) return true;
        if (key === "cnpj" && (value.includes("00.000.000/0000-00") || value.length < 14)) return true;
        if (key === "cpf_responsavel" && (value.replace(/\D/g, '') === "00000000000")) return true;
        return false;
      })
      .map(([key]) => key);

    let finalContent = model.content;
    Object.entries(placeholders).forEach(([key, value]) => {
      finalContent = finalContent.replace(new RegExp(key, 'g'), String(value || "A definir"));
    });

    // 8. DB UPSERT (CREATE OR UPDATE)
    let result;
    if (existingContract) {
      result = await supabaseAdmin
        .from("generated_contracts")
        .update({
          content_snapshot: finalContent,
          validation_errors: missingFields.length > 0 ? missingFields : null,
          metadata: { 
            ...((existingContract?.metadata as any) || {}), 
            placeholders, 
            updated_at: new Date().toISOString() 
          },
          version: model.version,
          model_id: model.id
        })
        .eq("id", existingContract.id)
        .select().single();
    } else {
      result = await supabaseAdmin
        .from("generated_contracts")
        .insert({
          prospect_id: prospect.id,
          model_id: model.id,
          version: model.version,
          content_snapshot: finalContent,
          status: 'contrato_gerado',
          validation_errors: missingFields.length > 0 ? missingFields : null,
          metadata: { placeholders }
        } as any)
        .select().single();

      // IMPORTANT: Update commercial_contracts status if it was aguardando_contrato
      if (contracting && contracting.status === 'aguardando_contrato') {
        await supabaseAdmin
          .from("commercial_contracts")
          .update({ status: 'contrato_gerado' })
          .eq("id", contracting.id);
      }
    }

    if (result.error) {
      console.error("[CONTRACT_GENERATION_DB_ERROR]", result.error);
      throw result.error;
    }

    const generated = result.data;
    console.log(`[CONTRACT_GENERATION_COMPLETE] success: true, contractId: ${generated.id}`);
    
    return {
      success: true,
      contractId: generated.id,
      id: generated.id,
      content_snapshot: generated.content_snapshot,
      missingFields,
      isInstitucionalDemo: !!(INSTITUCIONAL_DIGITAL_SC as any).is_demo
    };
  });


export const getContractForReview = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ contractId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    console.log(`[getContractForReview] Fetching contract: ${data.contractId}`);
    
    try {
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
        throw new Error(`erro_banco: ${error.message}`);
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
    } catch (err: any) {
      console.error("[getContractForReview] Catch-all error:", err);
      throw err;
    }
  });
