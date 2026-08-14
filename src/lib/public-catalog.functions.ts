import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo público.
 */
export const getPublicPlans = createServerFn({ method: "GET" })
  .handler(async () => {
    // Usamos o admin client no servidor para contornar qualquer restrição de RLS
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    console.log("[SERVER_FN] getPublicPlans - Attempting fetch with supabaseAdmin");
    
    const { data, error } = await supabaseAdmin
      .from("plans")
      .select(`
        *,
        plan_services (
          *,
          services (*)
        )
      `)
      .eq("status", "ativo");
      
    if (error) {
      console.error("[SERVER_FN] getPublicPlans error:", error);
      throw error;
    }
    
    console.log("[SERVER_FN] getPublicPlans success - Count:", data?.length);
    
    return (data || []).map(p => ({
      ...p,
      nome: p.nome || '',
      status: p.status || '',
      plan_services: p.plan_services || []
    }));
  });

export const getPublicServices = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("services")
      .select("*")
      .eq("status", "active");
      
    if (error) {
      console.error("[SERVER_FN] getPublicServices error:", error);
      throw error;
    }
    return (data as any[]) || [];
  });