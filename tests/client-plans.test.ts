import { describe, it, expect } from "vitest";
import { 
  formatCompetenceRange, 
  validateVigency,
  type VigencyDraft 
} from "@/lib/client-plans";

describe("Client Plan Logic (S3) - Unit Tests", () => {
  it("should format competence range correctly", () => {
    expect(formatCompetenceRange("2026-01", null)).toBe("Jan/2026 - Presente");
    expect(formatCompetenceRange("2026-01", "2026-03")).toBe("Jan/2026 - Mar/2026");
    expect(formatCompetenceRange("invalid", null)).toBe("invalid - Presente");
  });

  it("should validate vigency basic rules", () => {
    const valid: VigencyDraft = {
      client_id: "c1",
      plan_id: "p1",
      start_competence: "2026-01",
    };
    
    expect(validateVigency(valid)).toBeNull();
    
    expect(validateVigency({ ...valid, client_id: "" }))
      .toBe("Selecione um cliente");
      
    expect(validateVigency({ ...valid, plan_id: "" }))
      .toBe("Selecione um plano");
      
    expect(validateVigency({ ...valid, start_competence: "2026" }))
      .toBe("Competência inicial inválida (use AAAA-MM)");
  });
});
