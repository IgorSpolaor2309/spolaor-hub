import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo público: usa RPCs seguras (get_public_plans / get_public_services)
 * que expõem apenas colunas comerciais seguras — sem observações internas
 * ou notas comerciais.
 */
export const getPublicPlans = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await (supabase as any).rpc("get_public_plans");
    if (error) throw error;
    return (data as any[]) || [];
  });

export const getPublicServices = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await (supabase as any).rpc("get_public_services");
    if (error) throw error;
    return (data as any[]) || [];
  });
