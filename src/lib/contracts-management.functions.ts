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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 1. Get Prospect Data
    const { data: prospect, error: pError } = await supabaseAdmin
      .from("commercial_prospects")
      .select("*, plan:plan_id (*)")
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

    // 3. Prepare placeholders
    // For custom proposals, we might need to fetch the proposal snapshot
    const { data: proposal } = await supabaseAdmin
      .from("custom_proposals")
      .select("*")
      .eq("lead_id", (prospect as any).lead_id || "") // Need to ensure prospect has lead_id or email link
      .eq("status", "aceita")
      .maybeSingle();

    const placeholders: Record<string, string> = {
      "{{razao_social}}": prospect.contact_name || "",
      "{{cnpj}}": prospect.cnpj || "",
      "{{email}}": prospect.contact_email || "",
      "{{telefone}}": prospect.contact_phone || "",
      "{{plano}}": prospect.plan?.nome || "Personalizado",
      "{{valor_mensal}}": (prospect.final_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      "{{data_contratacao}}": new Date().toLocaleDateString("pt-BR"),
    };

    if (proposal) {
      placeholders["{{valor_implantacao}}"] = (proposal.setup_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      placeholders["{{servicos_incluidos}}"] = (proposal.services || [])
        .filter((s: any) => s.included).map((s: any) => s.name).join(", ");
      placeholders["{{servicos_extras}}"] = (proposal.services || [])
        .filter((s: any) => !s.included).map((s: any) => s.name).join(", ");
      placeholders["{{descontos}}"] = (proposal.discount_value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      placeholders["{{condicoes_especiais}}"] = proposal.special_conditions || "Nenhuma";
    }

    // 4. Replace placeholders in content
    let finalContent = model.content;
    Object.entries(placeholders).forEach(([key, value]) => {
      finalContent = finalContent.replace(new RegExp(key, 'g'), value);
    });

    // 5. Save generated contract
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
      .select()
      .single();

    if (gError) throw gError;
    return generated;
  });
