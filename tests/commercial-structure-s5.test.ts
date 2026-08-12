import { supabase } from "@/integrations/supabase/client";
import { expect, test } from "vitest";

test("Fase S5: Planos e Serviços devem estar atualizados", async () => {
  // 1. Verificar Planos
  const { data: plans, error: pErr } = await supabase
    .from("plans")
    .select("*")
    .eq("status", "ativo");

  expect(pErr).toBeNull();
  expect(plans?.length).toBeGreaterThanOrEqual(4);

  const planB = plans?.find(p => p.nome === "Plano B");
  expect(planB?.valor_padrao).toBe(300);

  const planC = plans?.find(p => p.nome === "Plano C");
  expect(planC?.valor_padrao).toBe(450);

  const planD = plans?.find(p => p.nome === "Plano D");
  expect(planD?.valor_padrao).toBe(700);

  // 2. Verificar Serviços (pelo menos alguns novos)
  const { data: services, error: sErr } = await supabase
    .from("services")
    .select("*");

  expect(sErr).toBeNull();
  const serviceNames = services?.map(s => s.nome);
  expect(serviceNames).toContain("DME");
  expect(serviceNames).toContain("DCTFWeb");

  // 3. Verificar Itens do Plano D (Operação)
  if (planD) {
    const { data: planItems, error: piErr } = await supabase
      .from("plan_items")
      .select("*")
      .eq("plan_id", planD.id);

    expect(piErr).toBeNull();
    const names = planItems?.map(i => i.titulo);
    expect(names).toContain("Preencher formulários para bancos");
    // O nome exato no banco é "Certidões (Receita Federal, Estadual e Trabalhista)"
    expect(names?.some(n => n.includes("Certidões"))).toBe(true);
  }
});
