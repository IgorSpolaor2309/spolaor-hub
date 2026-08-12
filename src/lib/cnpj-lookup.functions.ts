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

    const SUPABASE_URL = process.env['SUPABASE_URL'];
    const SUPABASE_ANON_KEY = process.env['SUPABASE_ANON_KEY'] || process.env['SUPABASE_PUBLISHABLE_KEY'];

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("[CNPJ DEBUG] Missing env vars:", { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY });
      throw new Error("Configuração de servidor incompleta.");
    }

    try {
      const url = `${SUPABASE_URL}/functions/v1/consultar-cnpj`;
      console.log(`[CNPJ DEBUG] Fetching Edge Function: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          // Não enviamos Authorization aqui para permitir acesso público via Server Function
        },
        body: JSON.stringify({ cnpj: digits }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CNPJ DEBUG] Edge Function HTTP Error ${response.status}:`, errorText);
        throw new Error(`Serviço indisponível (${response.status})`);
      }

      const result = await response.json();

      if (result.error) {
        console.warn("[CNPJ DEBUG] API Error:", result.error);
        throw new Error(result.error);
      }

      return result;
    } catch (err: any) {
      console.error("[CNPJ DEBUG] Exception:", err);
      throw new Error(err.message || "Falha na comunicação com o serviço de consulta.");
    }
  });
