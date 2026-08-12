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

    // No TanStack Start, o handlers roda no servidor (Worker/Node).
    // Se o usuário estiver logado, o cliente `supabase` usará a sessão dele se o middleware estiver configurado.
    // No entanto, para a Edge Function 'consultar-cnpj', queremos garantir que a chamada aconteça
    // mesmo sem sessão de usuário no frontend, pois o serverFn é nosso proxy seguro.
    
    let result, error;

    try {
      // Tentamos invocar com o cliente padrão (que pode ou não ter sessão)
      const resp = await supabase.functions.invoke("consultar-cnpj", {
        body: { cnpj: digits },
      });
      result = resp.data;
      error = resp.error;
    } catch (err) {
      console.error("CNPJ Lookup Invoke Error:", err);
      throw new Error("Falha na comunicação com o serviço de consulta.");
    }

    if (error) {
      console.error("CNPJ Lookup Error Response:", error);
      throw new Error("Erro ao consultar CNPJ na base da Receita.");
    }

    if (!result || result.error) {
      throw new Error(result?.error || "CNPJ não encontrado.");
    }

    return result;
  });
