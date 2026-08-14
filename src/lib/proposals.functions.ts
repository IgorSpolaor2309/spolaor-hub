import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";


const ProposalServiceSchema = z.object({
  service_id: z.string(),
  name: z.string(),
  value: z.number(),
  included: z.boolean(),
  notes: z.string().optional(),
  limit: z.string().optional()
});

const ProposalSchema = z.object({
  id: z.string().optional(),
  lead_id: z.string(),
  responsible_profile_id: z.string().optional().nullable(),
  base_plan_id: z.string().optional().nullable(),
  status: z.enum(['rascunho', 'enviada', 'aceita', 'recusada', 'expirada', 'cancelada']).optional(),
  monthly_value: z.number(),
  setup_value: z.number().optional(),
  discount_value: z.number().optional(),
  final_monthly_value: z.number(),
  max_revenue: z.number().optional().nullable(),
  company_count: z.number().optional(),
  branch_count: z.number().optional(),
  employee_count: z.number().optional(),
  services: z.array(ProposalServiceSchema).optional(),
  commercial_notes: z.string().optional(),
  special_conditions: z.string().optional(),
  valid_until: z.string().optional().nullable()
});

export const getProposalByLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ leadId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: proposal, error } = await (context.supabase as any)

      .from("custom_proposals")
      .select(`
        *,
        responsible:responsible_profile_id (full_name, avatar_url),
        base_plan:base_plan_id (nome, valor_padrao),
        history:proposal_history (
          *,
          profile:profile_id (full_name)
        )
      `)
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error) throw error;
    return proposal;
  });

export const saveProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ProposalSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    const { supabase, userId } = context;


    let result;
    if (id) {
      // Check if locked
      const { data: existing } = await (supabase as any)
        .from("custom_proposals")
        .select("status")
        .eq("id", id)
        .single();
      
      if (existing?.status === 'aceita') {
        throw new Error("Propostas aceitas não podem ser editadas.");
      }

      result = await (supabase as any)
        .from("custom_proposals")
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await (supabase as any)
        .from("custom_proposals")
        .insert({
          ...payload,
          responsible_profile_id: payload.responsible_profile_id || userId
        })
        .select()
        .single();
    }

    if (result.error) throw result.error;
    return result.data;
  });

export const updateProposalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({
    id: z.string(),
    status: z.enum(['rascunho', 'enviada', 'aceita', 'recusada', 'expirada', 'cancelada']),
    notes: z.string().optional()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { supabase, userId } = context;


    const { data: proposal } = await (supabase as any)
      .from("custom_proposals")
      .select("*")
      .eq("id", data.id)
      .single();

    if (!proposal) throw new Error("Proposta não encontrada");
    
    // Prevent re-processing accepted
    if (proposal.status === 'aceita' && data.status !== 'aceita') {
       // Allow changing to other status only if not strictly blocked, but usually accepted is terminal
    }

    const updatePayload: any = { status: data.status };
    
    if (data.status === 'aceita' && proposal.status !== 'aceita') {
      updatePayload.accepted_at = new Date().toISOString();
      updatePayload.acceptance_snapshot = proposal; // Capture current state as snapshot
      
      // TRIGGER COMMERCIAL FLOW
      const { data: lead } = await (supabase as any)
        .from("leads")
        .select("*")
        .eq("id", proposal.lead_id)
        .single();

      // 1. Create/Update Prospect
      const { data: prospect, error: pError } = await (supabaseAdmin as any)
        .from("commercial_prospects")
        .upsert({
          contact_email: lead.email,
          contact_name: lead.name,
          contact_phone: lead.phone,
          cnpj: lead.cnpj,
          plan_id: proposal.base_plan_id,
          final_value: proposal.final_monthly_value,
          discount_value: proposal.discount_value,
          status_comercial: 'contratação_em_andamento',
          flow_origin: lead.origin || 'proposta_personalizada',
          updated_at: new Date().toISOString()
        }, { onConflict: 'contact_email' })
        .select()
        .single();

      if (pError) throw pError;

      // 2. Create Contract Intent
      await (supabaseAdmin as any)
        .from("commercial_contracts")
        .insert({
          prospect_id: prospect.id,
          plan_id: proposal.base_plan_id,
          plan_value: proposal.monthly_value,
          final_value: proposal.final_monthly_value,
          discount_value: proposal.discount_value,
          status: 'aguardando_contrato',
          contract_data: {
            ...proposal,
            lead_id: lead.id,
            is_custom_proposal: true
          }
        });
        
      // 3. Update Lead Status
      await (supabaseAdmin as any)
        .from("leads")
        .update({ status: 'contratação_em_andamento' })
        .eq("id", lead.id);
    }

    const { error: updateError } = await (supabase as any)
      .from("custom_proposals")
      .update(updatePayload)
      .eq("id", data.id);

    if (updateError) throw updateError;

    // Record History
    await (supabase as any)
      .from("proposal_history")
      .insert({
        proposal_id: data.id,
        profile_id: userId,
        previous_status: proposal.status,
        new_status: data.status,
        change_notes: data.notes
      });

    return { success: true };
  });

export const duplicateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: original } = await (context.supabase as any)

      .from("custom_proposals")
      .select("*")
      .eq("id", data.id)
      .single();

    if (!original) throw new Error("Proposta não encontrada");

    const { id, created_at, updated_at, status, acceptance_snapshot, accepted_at, ...payload } = original;
    
    const { data: newProposal, error } = await (supabase as any)
      .from("custom_proposals")
      .insert({
        ...payload,
        status: 'rascunho'
      })
      .select()
      .single();

    if (error) throw error;
    return newProposal;
  });
