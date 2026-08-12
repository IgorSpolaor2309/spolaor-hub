import { describe, it, expect, beforeAll } from "vitest";
import { supabase } from "../src/integrations/supabase/client";

// Este teste assume que o banco de dados tem as extensões necessárias 
// e que a migração S4 foi aplicada com sucesso.

describe("Geração de Checklist S4 baseada em Planos", () => {
  let testClientId: string;
  let testPlanId: string;
  let testServiceId: string;
  const competence = "2026-08";

  beforeAll(async () => {
    // Setup de dados para teste (Admin scope ou bypassing RLS if needed, but we test the RPC)
    // Nota: Como estamos em ambiente de teste real, tentamos usar dados existentes 
    // ou criar registros temporários se possível.
  });

  it("deve rodar a RPC generate_plan_checklist sem erros", async () => {
    const { data, error } = await (supabase as any).rpc("generate_plan_checklist", {
      _competencia: competence
    });

    if (error) {
      console.error("Erro na RPC:", error);
    }
    
    expect(error).toBeNull();
    expect(data).toHaveProperty("criados");
    expect(data).toHaveProperty("ignorados_existentes");
    expect(data).toHaveProperty("empresas_sem_plano");
  });

  it("deve validar o formato da competência", async () => {
    const { error } = await (supabase as any).rpc("generate_plan_checklist", {
      _competencia: "invalid-date"
    });
    
    expect(error).not.toBeNull();
    expect(error.message).toContain("Formato de competência inválido");
  });

  it("deve garantir idempotência (rodar 2x não cria duplicados)", async () => {
    // Rodada 1
    const res1 = await (supabase as any).rpc("generate_plan_checklist", {
      _competencia: competence
    });
    
    // Rodada 2
    const res2 = await (supabase as any).rpc("generate_plan_checklist", {
      _competencia: competence
    });

    expect(res2.data.criados).toBe(0);
    expect(res2.data.ignorados_existentes).toBeGreaterThanOrEqual(res1.data.criados);
  });
});
