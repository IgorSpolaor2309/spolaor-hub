import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const getPublicPlans = createServerFn({ method: "GET" })
  .handler(async () => {
    // Busca planos ativos
    const { data: plans, error: plansError } = await (supabase as any)
      .from("plans")
      .select(`
        *,
        plan_services (
          id,
          tipo_inclusao,
          service_id,
          services (
            id,
            nome,
            categoria,
            descricao
          )
        )
      `)
      .eq("status", "ativo")
      .order("nome");

    if (plansError) throw plansError;
    return plans || [];
  });

export const getPublicServices = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: services, error: servicesError } = await (supabase as any)
      .from("services")
      .select("*")
      .eq("status", "ativo")
      .order("categoria")
      .order("nome");

    if (servicesError) throw servicesError;
    return services || [];
  });
