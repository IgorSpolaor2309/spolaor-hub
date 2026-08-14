import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const LeadTrackSchema = z.object({
  leadId: z.string().optional(),
  journeyStep: z.string(),
  bottleneckIndicator: z.string().optional(),
  estimatedValue: z.number().optional(),
  extractedData: z.any().optional(),
  contactData: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional()
  }).optional(),
  planId: z.string().optional(),
  flowType: z.enum(["opening", "switching"]).optional(),
  cnpj: z.string().optional(),
  lastInteraction: z.string().optional(),
  interestedInPersonalized: z.boolean().optional(),
  preferredChannel: z.enum(["whatsapp", "videoconference"]).optional(),
  origin: z.string().optional(),
  sessionId: z.string().optional()
});

export const trackLeadJourney = createServerFn({ method: "POST" })
  .inputValidator((data) => LeadTrackSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Preparar payload para a tabela de LEADS
    const payload: any = {
      journey_data: { 
        step: data.journeyStep,
        bottleneck: data.bottleneckIndicator,
        extracted: data.extractedData,
        plan_id: data.planId
      },
      last_interaction_at: new Date().toISOString(),
      last_interaction_description: data.lastInteraction || data.journeyStep,
      updated_at: new Date().toISOString()
    };

    if (data.contactData?.name) payload.name = data.contactData.name;
    if (data.contactData?.email) payload.email = data.contactData.email;
    if (data.contactData?.phone) payload.phone = data.contactData.phone;
    if (data.cnpj) payload.cnpj = data.cnpj;
    if (data.estimatedValue) payload.estimated_revenue = data.estimatedValue;
    if (data.interestedInPersonalized !== undefined) {
      payload.interested_in_personalized_solution = data.interestedInPersonalized;
      payload.status = 'aguardando_contato';
    }
    if (data.preferredChannel) payload.preferred_contact_channel = data.preferredChannel;
    if (data.origin || data.flowType) payload.origin = data.origin || data.flowType;
    if (data.sessionId) payload.session_id = data.sessionId;

    let result;
    if (data.leadId) {
      result = await supabaseAdmin
        .from("leads")
        .update(payload)
        .eq("id", data.leadId)
        .select()
        .single();
    } else {
      result = await supabaseAdmin
        .from("leads")
        .insert({
          ...payload,
          status: payload.status || "novo"
        })
        .select()
        .single();
    }
    
    if (result.error) {
      console.error("Error tracking lead (admin):", result.error);
      throw result.error;
    }
    
    // SE houver intenção explícita de contratação (checkout iniciado), 
    // TAMBÉM criamos/atualizamos o commercial_prospects
    if (data.journeyStep === 'checkout_iniciado' || data.journeyStep === 'contratacao_confirmada') {
      const prospectPayload: any = {
        flow_origin: data.origin || data.flowType,
        contact_name: payload.name,
        contact_email: payload.email,
        contact_phone: payload.phone,
        cnpj: data.cnpj,
        plan_id: data.planId,
        estimated_value: data.estimatedValue,
        status_comercial: 'contratação_em_andamento',
        updated_at: new Date().toISOString()
      };

      // Tenta encontrar um prospect já existente pelo email ou criar novo
      const { data: existingProspect } = await supabaseAdmin
        .from("commercial_prospects")
        .select("id")
        .eq("contact_email", payload.email)
        .maybeSingle();

      if (existingProspect) {
        await supabaseAdmin
          .from("commercial_prospects")
          .update(prospectPayload)
          .eq("id", existingProspect.id);
      } else {
        await supabaseAdmin
          .from("commercial_prospects")
          .insert({
            ...prospectPayload,
            created_at: new Date().toISOString()
          });
      }
    }

    console.log(`[Lead Track] Success for ${data.journeyStep}. ID: ${result.data?.id}`);
    return { success: true, prospectId: result.data.id }; // Mantendo nome prospectId para compatibilidade no frontend por enquanto
  });

export const getLeads = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Agora buscamos da tabela LEADS para o dashboard inicial
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(`
        *
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });

export const updateLeadRecovery = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    id: z.string(),
    status: z.string().optional(),
    priority: z.string().optional(),
    responsible_profile_id: z.string().optional().nullable(),
    next_action_description: z.string().optional(),
    next_action_date: z.string().optional().nullable(),
    internal_notes: z.string().optional(),
    last_interaction_description: z.string().optional(),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...payload } = data;
    const { error } = await supabaseAdmin
      .from("leads")
      .update(payload)
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  });

// Adiciona histórico ao commercial_prospect se ele existir
export const addLeadHistory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    prospect_id: z.string(),
    action_type: z.string(),
    content: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { error } = await supabaseAdmin
      .from("commercial_prospect_history")
      .insert({
        ...data,
        profile_id: user.id
      });

    if (error) throw error;
    return { success: true };
  });

export const getCollaborators = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url")
      .or('role.eq.admin,role.eq.collaborator');

    if (error) throw error;
    return data;
  });
