import { supabase } from "@/integrations/supabase/client";
import { expect, test } from "vitest";

/**
 * Smoke test para a Fase S5 - Estrutura Comercial.
 * Valida a renomeação dos planos e a sincronização de serviços.
 */
test("Fase S5: Planos e Serviços devem estar atualizados", async () => {
  // 1. Validar Planos
  const { data: plans, error: pErr } = await supabase
    .from("plans")
    .select("*")
    .in("nome", ["Plano A", "Plano B", "Plano C", "Plano D", "Plano Demais"])
    .eq("status", "ativo");

  expect(pErr).toBeNull();
  expect(plans?.length).toBeGreaterThanOrEqual(4);

  const planB = plans?.find(p => p.nome === "Plano B");
  expect(planB?.valor_padrao).toBe(300);
  expect(planB?.limite_faturamento).toBe(8400);

  const planC = plans?.find(p => p.nome === "Plano C");
  expect(planC?.valor_padrao).toBe(450);

  const planD = plans?.find(p => p.nome === "Plano D");
  expect(planD?.valor_padrao).toBe(700);

  // 2. Validar Serviços
  const { data: services, error: sErr } = await supabase
    .from("services")
    .select("*")
    .in("nome", ["Abertura de empresa", "Alteração de empresa", "Escrituração contábil para MEI", "DEFIS"]);

  expect(sErr).toBeNull();
  
  const abertura = services?.find(s => s.nome === "Abertura de empresa");
  expect(abertura?.valor_referencia).toBe(1500);

  const mei = services?.find(s => s.nome === "Escrituração contábil para MEI");
  expect(mei?.valor_referencia).toBe(150);
  expect(mei?.categoria).toBe("MEI");

  const defis = services?.find(s => s.nome === "DEFIS");
  expect(defis?.tipo_preco).toBe("sob_orcamento");

  // 3. Validar Checklist Automático (Plan D)
  if (planD) {
    const { data: planItems, error: iErr } = await supabase
      .from("plan_items")
      .select("*")
      .eq("plan_id", planD.id);
    
    expect(iErr).toBeNull();
    // Pelo menos os 3 novos devem existir
    const names = planItems?.map(i => i.titulo);
    expect(names).toContain("Preencher formulários para bancos");
    expect(names).toContain("Certidões Negativas (Receita, Estado, Trabalho)");
  }
});
