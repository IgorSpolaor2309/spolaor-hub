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
      console.log(`[CNPJ DEBUG] Iniciando consulta para: ${digits}`);
      const { data: result, error } = await supabase.functions.invoke("consultar-cnpj", {
        body: { cnpj: digits },
      });

      if (error) {
        console.error("[CNPJ DEBUG] Invoke Error:", error);
        // Tenta extrair a mensagem de erro da resposta se disponível
        let errorMessage = "Erro técnico ao tentar consultar o CNPJ.";
        if (error instanceof Error) errorMessage = error.message;
        
        throw new Error(errorMessage);
      }

      if (!result) {
        console.error("[CNPJ DEBUG] Resposta vazia da Edge Function");
        throw new Error("Não recebemos dados do serviço de consulta.");
      }

      if (result.error) {
        console.warn("[CNPJ DEBUG] Erro reportado pela função:", result.error);
        throw new Error(result.error);
      }

      console.log("[CNPJ DEBUG] Consulta bem-sucedida:", result.razao_social);
      return result;
    } catch (err: any) {
      console.error("[CNPJ DEBUG] Exception capturada:", err);
      throw new Error(err.message || "Falha na comunicação com o serviço de consulta.");
    }
  });
