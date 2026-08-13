import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const ContractSchema = z.object({
  prospect_id: z.string(),
  plan_id: z.string(),
  plan_value: z.number(),
  extra_services: z.array(z.any()).optional(),
  applied_coupon: z.string().optional(),
  discount_value: z.number().optional(),
  final_value: z.number(),
  contract_data: z.any().optional(),
});

export const createContractIntent = createServerFn({ method: "POST" })
  .inputValidator((data) => ContractSchema.parse(data))
  .handler(async ({ data }) => {
    const { error } = await (supabase as any)
      .from("commercial_contracts")
      .insert({
        ...data,
        status: 'aguardando_contrato'
      });

    if (error) throw error;
    return { success: true };
  });

export const getContracts = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await (supabase as any)
      .from("commercial_contracts")
      .select(`
        *,
        prospect:prospect_id (contact_name, contact_email, contact_phone, cnpj),
        plan:plan_id (nome)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });

export const updateContractStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    id: z.string(),
    status: z.enum(['aguardando_contrato', 'contrato_enviado', 'contrato_assinado', 'cancelado'])
  }).parse(data))
  .handler(async ({ data }) => {
    const { id, status } = data;
    
    // Atualiza status básico
    const updatePayload: any = { status };
    if (status === 'contrato_assinado') {
      updatePayload.signed_at = new Date().toISOString();
    }

    const { error: updateError } = await (supabase as any)
      .from("commercial_contracts")
      .update(updatePayload)
      .eq("id", id);

    if (updateError) throw updateError;

    // Se assinado, dispara automação via RPC
    if (status === 'contrato_assinado') {
      const { data: rpcData, error: rpcError } = await (supabase as any)
        .rpc('process_signed_contract', { _contract_id: id });

      if (rpcError) {
        console.error("RPC Error processing contract:", rpcError);
        throw rpcError;
      }
      return rpcData;
    }

    return { success: true };
  });
