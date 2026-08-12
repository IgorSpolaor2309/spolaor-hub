import { createClient } from "@supabase/supabase-js";
import { expect, test } from "vitest";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

test("Fase S5: Database Health Check", async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase credentials in environment");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: plans, error: pErr } = await supabase
    .from("plans")
    .select("nome, status, valor_padrao")
    .eq("status", "ativo");

  console.log("PLANS DATA:", JSON.stringify(plans, null, 2));
  
  if (pErr) {
    console.error("ERROR:", pErr);
    throw pErr;
  }

  expect(plans?.length).toBeGreaterThanOrEqual(4);
});
