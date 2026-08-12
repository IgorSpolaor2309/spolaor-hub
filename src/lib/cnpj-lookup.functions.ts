import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const lookupCNPJ = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const digits = data.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      throw new Error("CNPJ deve ter 14 dígitos.");
    }

    const { data: result, error } = await supabase.functions.invoke("consultar-cnpj", {
      body: { cnpj: digits },
    });

    if (error) {
      console.error("CNPJ Lookup Error:", error);
      throw new Error("Erro ao consultar CNPJ na base da Receita.");
    }

    if (!result || result.error) {
      throw new Error(result?.error || "CNPJ não encontrado.");
    }

    return result;
  });
