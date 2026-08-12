import { supabase } from "@/integrations/supabase/client";
import { expect, test } from "vitest";

test("Fase S5: Debug Planos", async () => {
  const { data: allPlans, error } = await supabase.from("plans").select("nome, status, valor_padrao");
  console.log("DEBUG PLANS:", JSON.stringify(allPlans, null, 2));
  expect(error).toBeNull();
  
  const activePlans = allPlans?.filter(p => p.status === 'ativo');
  console.log("ACTIVE PLANS COUNT:", activePlans?.length);
  
  const names = activePlans?.map(p => p.nome);
  console.log("ACTIVE NAMES:", names);
  
  expect(activePlans?.length).toBeGreaterThanOrEqual(4);
});
