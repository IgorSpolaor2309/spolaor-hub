import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { validateCnpj, onlyDigits } from "./cnpj";

export const lookupCNPJ = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ cnpj: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const digits = onlyDigits(data.cnpj);
    
    if (digits.length !== 14) {
      throw new Error("CNPJ deve ter exatos 14 dígitos.");
    }

    if (!validateCnpj(digits)) {
      throw new Error("O CNPJ informado é inválido (dígitos verificadores incorretos).");
    }

    try {
      console.log(`[CNPJ DEBUG] Fetching Minha Receita directly for CNPJ: ${digits}`);
      const response = await fetch(`https://minhareceita.org/${digits}`);
      
      const status = response.status;
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error(`[CNPJ DEBUG] Minha Receita HTTP Error ${status}: ${responseText}`);
        if (status === 404) throw new Error("CNPJ não encontrado na base da Receita.");
        throw new Error(`Serviço da Receita indisponível (Erro ${status}).`);
      }

      try {
        return JSON.parse(responseText);
      } catch (parseErr) {
        console.error("[CNPJ DEBUG] JSON Parse Error from Minha Receita:", responseText);
        throw new Error("Resposta inválida da base da Receita.");
      }
    } catch (err: any) {
      console.error("[CNPJ DEBUG] Handler Exception:", err);
      throw new Error(err.message || "Erro inesperado ao consultar CNPJ.");
    }
  });
