import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const validateCoupon = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ code: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: coupon, error } = await (supabase as any)
      .from("coupons")
      .select("*")
      .eq("code", data.code.toUpperCase())
      .eq("status", "active")
      .maybeSingle();

    if (error) throw error;
    if (!coupon) return { valid: false, message: "Cupom inválido ou expirado" };

    const now = new Date();
    if (coupon.start_date && new Date(coupon.start_date) > now) return { valid: false, message: "Cupom ainda não está ativo" };
    if (coupon.end_date && new Date(coupon.end_date) < now) return { valid: false, message: "Cupom expirado" };

    return { valid: true, coupon };
  });

export const confirmContracting = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    flow_type: z.enum(["opening", "switching"]),
    extracted_data: z.any(),
    plan_id: z.string(),
    extra_service_ids: z.array(z.string()),
    coupon_id: z.string().optional(),
    contact_data: z.object({
      name: z.string(),
      email: z.string().email(),
      phone: z.string()
    }),
    totals: z.object({
      originalValue: z.number(),
      discountValue: z.number(),
      finalValue: z.number()
    })
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: prospect, error } = await supabase
      .from("commercial_prospects")
      .insert({
        flow_origin: data.flow_type,
        contact_name: data.contact_data.name,
        contact_email: data.contact_data.email,
        contact_phone: data.contact_data.phone,
        cnpj: data.extracted_data?.cnpj || null,
        ai_extracted_data: data.extracted_data,
        plan_id: data.plan_id,
        extra_service_ids: data.extra_service_ids,
        coupon_id: data.coupon_id || null,
        original_value: data.totals.originalValue,
        discount_value: data.totals.discountValue,
        final_value: data.totals.finalValue,
        status_comercial: "Aguardando onboarding"
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving prospect:", error);
      throw new Error("Falha ao registrar a contratação.");
    }

    return { 
      success: true, 
      message: "Contratação confirmada com sucesso!",
      prospectId: prospect.id 
    };
  });