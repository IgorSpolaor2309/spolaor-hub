import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo público.
 */
export const getPublicPlans = createServerFn({ method: "GET" })
  .handler(async () => {
    console.log("[SERVER_FN] getPublicPlans starting");
    
    // Explicitly using the generated client which uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
    const { data, error } = await supabase
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
    
    console.log("[SERVER_FN] getPublicPlans success, count:", data?.length);
    // Standardize the return to ensure compatibility
    return (data || []).map(p => ({
      ...p,
      nome: p.nome || '',
      status: p.status || '',
      plan_services: p.plan_services || []
    }));
  });

export const getPublicServices = createServerFn({ method: "GET" })
  .handler(async () => {
    console.log("[SERVER_FN] getPublicServices starting");
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("status", "active");
      
    if (error) {
      console.error("[SERVER_FN] getPublicServices error:", error);
      throw error;
    }
    console.log("[SERVER_FN] getPublicServices success, count:", data?.length);
    return (data as any[]) || [];
  });