import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const OpeningSchema = z.object({
  context: z.string(),
  contact: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
});

export const processOpeningMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => OpeningSchema.parse(data))
  .handler(async ({ data }) => {
    // This is where the AI logic will be integrated
    // For now, this is a placeholder response that will simulate 
    // the extraction and diagnostic process
    return {
      status: "processing",
      response: "Entendi. Para que eu possa te dar um diagnóstico preciso e sugerir o melhor plano para sua nova empresa, preciso de algumas informações extras: nome do interessado, cidade e faturamento previsto. Você pode me contar um pouco mais?",
      suggestedData: {
        business_type: null,
        city: null,
        estimated_revenue: null
      }
    };
  });
