import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const LeadTrackSchema = z.object({
  prospectId: z.string().optional(),
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
  flowType: z.enum(["opening", "switching"]).optional()
});

export const trackLeadJourney = createServerFn({ method: "POST" })
  .inputValidator((data) => LeadTrackSchema.parse(data))
  .handler(async ({ data }) => {
    const payload: any = {
      journey_step: data.journeyStep,
      last_interaction_at: new Date().toISOString()
    };

    if (data.bottleneckIndicator) payload.bottleneck_indicator = data.bottleneckIndicator;
    if (data.estimatedValue) payload.estimated_value = data.estimatedValue;
    if (data.extractedData) payload.ai_extracted_data = data.extractedData;
    if (data.contactData?.name) payload.contact_name = data.contactData.name;
    if (data.contactData?.email) payload.contact_email = data.contactData.email;
    if (data.contactData?.phone) payload.contact_phone = data.contactData.phone;
    if (data.planId) payload.plan_id = data.planId;
    if (data.flowType) payload.flow_origin = data.flowType;

    let result;
    if (data.prospectId) {
      result = await (supabase as any)
        .from("commercial_prospects")
        .update(payload)
        .eq("id", data.prospectId)
        .select()
        .single();
    } else {
      // Se não tem ID, cria um novo lead (interessado inicial)
      result = await (supabase as any)
        .from("commercial_prospects")
        .insert({
          ...payload,
          status_comercial: "interessado"
        })
        .select()
        .single();
    }

    if (result.error) {
      console.error("Error tracking lead:", result.error);
      throw result.error;
    }

    return { success: true, prospectId: result.data.id };
  });

export const getLeads = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await (supabase as any)
      .from("commercial_prospects")
      .select(`
        *,
        plans:plan_id (nome)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  });
