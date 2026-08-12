import { expect, test, describe, beforeAll } from "vitest";
import { calculateCommercialTotal } from "../src/lib/commercial-calculations";

describe("Commercial Calculations (Fase S6)", () => {
  const planA = { id: "p1", name: "Plano A", value: 180, type: "plan" as const };
  const serviceX = { id: "s1", name: "Serviço X", value: 50, type: "service" as const };
  const serviceY = { id: "s2", name: "Serviço Y", value: 100, type: "service" as const };

  test("calculates total without coupon", () => {
    const res = calculateCommercialTotal(planA, [serviceX], null);
    expect(res.originalValue).toBe(230);
    expect(res.discountValue).toBe(0);
    expect(res.finalValue).toBe(230);
  });

  test("applies fixed discount to all", () => {
    const coupon = { 
      id: "c1", code: "FIXO50", discount_type: "fixed" as const, 
      discount_value: 50, apply_to: "all" as const 
    };
    const res = calculateCommercialTotal(planA, [serviceX], coupon);
    expect(res.originalValue).toBe(230);
    expect(res.discountValue).toBe(50);
    expect(res.finalValue).toBe(180);
  });

  test("applies percentage discount to all", () => {
    const coupon = { 
      id: "c2", code: "PROMO10", discount_type: "percentage" as const, 
      discount_value: 10, apply_to: "all" as const 
    };
    const res = calculateCommercialTotal(planA, [serviceX], coupon);
    expect(res.originalValue).toBe(230);
    expect(res.discountValue).toBe(23);
    expect(res.finalValue).toBe(207);
  });

  test("applies percentage discount with max cap", () => {
    const coupon = { 
      id: "c3", code: "PROMO50", discount_type: "percentage" as const, 
      discount_value: 50, max_discount: 40, apply_to: "all" as const 
    };
    const res = calculateCommercialTotal(planA, [serviceX], coupon);
    expect(res.originalValue).toBe(230);
    expect(res.discountValue).toBe(40); // 50% of 230 is 115, capped at 40
    expect(res.finalValue).toBe(190);
  });

  test("applies discount only to specific plans", () => {
    const coupon = { 
      id: "c4", code: "PLANONLY", discount_type: "percentage" as const, 
      discount_value: 10, apply_to: "specific_plans" as const, target_ids: ["p1"]
    };
    const res = calculateCommercialTotal(planA, [serviceX], coupon);
    expect(res.originalValue).toBe(230);
    expect(res.discountValue).toBe(18); // 10% of 180 (plan only)
    expect(res.finalValue).toBe(212);
  });

  test("discount cannot exceed original value", () => {
    const coupon = { 
      id: "c5", code: "SUPER", discount_type: "fixed" as const, 
      discount_value: 1000, apply_to: "all" as const 
    };
    const res = calculateCommercialTotal(planA, [serviceX], coupon);
    expect(res.finalValue).toBe(0);
    expect(res.discountValue).toBe(230);
  });
});
