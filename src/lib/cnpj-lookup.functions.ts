import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { validateCnpj, onlyDigits } from "./cnpj";

export const lookupCNPJ = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const digits = onlyDigits(data.cnpj);
    
    // Validação rigorosa antes de chamar a API
    if (digits.length !== 14) {
      throw new Error("CNPJ deve ter exatos 14 dígitos.");
    }

    if (!validateCnpj(digits)) {
      throw new Error("O CNPJ informado é inválido (dígitos verificadores incorretos).");
    }

    // A Server Function roda no servidor (Worker). 
    // Como a Edge Function 'consultar-cnpj' foi ajustada para aceitar chamadas anon,
    // o cliente padrão do supabase aqui já funcionará, pois ele usará a ANON_KEY
    // configurada no ambiente para invocar a função.
    
    try {
      const { data: result, error } = await supabase.functions.invoke("consultar-cnpj", {
        body: { cnpj: digits },
      });

      if (error) {
        // Se der erro de autorização ou outro erro técnico do Supabase
        console.error("CNPJ Lookup Invoke Error:", error);
        throw new Error("Erro técnico ao tentar consultar o CNPJ.");
      }

      if (!result || result.error) {
        // Erro retornado pela API Minha Receita ou regra de negócio da função
        throw new Error(result?.error || "CNPJ não encontrado.");
      }

      return result;
    } catch (err: any) {
      console.error("CNPJ Lookup Handler Error:", err);
      throw new Error(err.message || "Falha na comunicação com o serviço de consulta.");
    }
  });
