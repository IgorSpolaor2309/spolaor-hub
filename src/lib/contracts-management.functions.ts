import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
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
  .handler(async () => {
    const { data, error } = await supabase
      .from("contract_models")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

export const saveContractModel = createServerFn({ method: "POST" })
  .inputValidator((data) => ContractModelSchema.parse(data))
  .handler(async ({ data }) => {
    const { id, ...payload } = data;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    let result;
    if (id) {
      result = await supabase
        .from("contract_models")
        .update({
          ...payload,
          updated_by: user.id,
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
          created_by: user.id,
          updated_by: user.id
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { INSTITUCIONAL_DIGITAL_SC } = await import("./institucional.server");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Get Prospect Data with Lead and Plan info
    const { data: prospect, error: pError } = await supabaseAdmin
      .from("commercial_prospects")
      .select(`
        *,
        plan:plan_id (*),
        lead:contact_email (
          id, name, email, phone, cnpj, city, 
          business_type, estimated_revenue, 
          journey_data
        )
      `)
      .eq("id", data.prospectId)
      .single();
    
    if (pError || !prospect) throw new Error("Prospect não encontrado");

    // 2. Get Active Model
    const { data: model, error: mError } = await supabaseAdmin
      .from("contract_models")
      .select("*")
      .eq("status", "ativo")
      .single();
    
    if (mError || !model) throw new Error("Nenhum modelo de contrato ativo encontrado");

    // 3. Get Proposal Snapshot if personalized
    const { data: proposal } = await supabaseAdmin
      .from("custom_proposals")
      .select("*")
      .eq("lead_id", (prospect.lead as any)?.id || "")
      .eq("status", "aceita")
      .maybeSingle();

    // 4. Base Placeholders Mapping
    const placeholders: Record<string, string> = {
      // CONTRATANTE (Prospect/Lead)
      "{{razao_social}}": prospect.contact_name || prospect.lead?.name || "",
      "{{cnpj}}": prospect.cnpj || prospect.lead?.cnpj || "",
      "{{email}}": prospect.contact_email || prospect.lead?.email || "",
      "{{telefone}}": prospect.contact_phone || prospect.lead?.phone || "",
      "{{endereco}}": (prospect.lead?.journey_data as any)?.extracted?.address || prospect.lead?.city || "",
      "{{natureza_juridica}}": (prospect.lead?.journey_data as any)?.extracted?.legal_nature || "A definir",
      "{{nome_responsavel}}": prospect.contact_name || "",
      "{{cpf_responsavel}}": (prospect.lead?.journey_data as any)?.extracted?.cpf || "",
      
      // COMERCIAL / OPERACIONAL
      "{{plano}}": prospect.plan?.nome || "Personalizado",
      "{{valor_mensal}}": (prospect.final_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      "{{valor_implantacao}}": (prospect.original_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      "{{dia_vencimento}}": "10", // Padrão Digital SC
      "{{competencia_inicial}}": new Date().toLocaleDateString("pt-BR", { month: 'long', year: 'numeric' }),
      "{{limite_faturamento}}": prospect.plan?.limite_faturamento || (proposal?.max_revenue ? proposal.max_revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Conforme Proposta"),
      "{{estrutura_incluida}}": "Atendimento Digital via WhatsApp e Plataforma",
      "{{vigencia}}": "12 meses",
      "{{reajuste}}": "IGP-M/FGV anual",
      "{{data_contratacao}}": new Date().toLocaleDateString("pt-BR"),
      
      // CONTRATADA (Institucional)
      "{{crc_sp}}": INSTITUCIONAL_DIGITAL_SC.crc_sp,
      "{{cidade_assinatura}}": INSTITUCIONAL_DIGITAL_SC.cidade_assinatura,
      "{{representante_contratada}}": INSTITUCIONAL_DIGITAL_SC.representante,
      "{{cpf_representante_contratada}}": INSTITUCIONAL_DIGITAL_SC.cpf_representante,
    };

    // 5. Override/Add Custom Proposal Data
    if (proposal) {
      const services = (proposal.services as any[]) || [];
      placeholders["{{valor_implantacao}}"] = (proposal.setup_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      placeholders["{{servicos_incluidos}}"] = services.filter((s: any) => s.included).map((s: any) => s.name).join(", ");
      placeholders["{{servicos_extras}}"] = services.filter((s: any) => !s.included).map((s: any) => s.name).join(", ");
      placeholders["{{descontos}}"] = (proposal.discount_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      placeholders["{{condicoes_especiais}}"] = (proposal.special_conditions as string) || "Nenhuma";
    } else {
      placeholders["{{servicos_incluidos}}"] = "Serviços Contábeis padrão conforme catálogo";
      placeholders["{{servicos_extras}}"] = "Consultoria Especializada, Auditoria Retroativa";
      placeholders["{{descontos}}"] = "R$ 0,00";
      placeholders["{{condicoes_especiais}}"] = "Nenhuma";
    }

    // 6. Validation of Mandatory Fields
    const mandatory = ["{{razao_social}}", "{{cnpj}}", "{{email}}"];
    for (const key of mandatory) {
      if (!placeholders[key]) {
        throw new Error(`Campo obrigatório faltando para o contrato: ${key.replace('{{', '').replace('}}', '').replace('_', ' ')}`);
      }
    }

    // 7. Replace placeholders in content
    let finalContent = model.content;
    Object.entries(placeholders).forEach(([key, value]) => {
      // Use empty string for empty values, prevent "undefined"
      const safeValue = value || "";
      finalContent = finalContent.replace(new RegExp(key, 'g'), safeValue);
    });

    // 8. Save generated contract
    const { data: generated, error: gError } = await supabaseAdmin
      .from("generated_contracts")
      .insert({
        prospect_id: prospect.id,
        model_id: model.id,
        version: model.version,
        content_snapshot: finalContent,
        status: 'contrato_gerado',
        created_by: user.id
      })
      .select().single();

    if (gError) throw gError;
    return generated;
  });
