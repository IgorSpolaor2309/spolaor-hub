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
      
      const status = response.status;
      const responseText = await response.text();
      
      console.log(`[CNPJ DEBUG] Raw Response:`, { status, responseText });
      
      if (!response.ok) {
        console.error(`[CNPJ DEBUG] HTTP Error ${status}: ${responseText}`);
        
        if (status === 404) throw new Error("CNPJ não encontrado na base da Receita.");
        if (status === 400) throw new Error("CNPJ inválido para consulta.");
        if (status === 401 || status === 403) {
          throw new Error("Erro de autorização no serviço de consulta. Contate o suporte.");
        }
        
        throw new Error(`Falha técnica no serviço de consulta (Status ${status})`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("[CNPJ DEBUG] JSON Parse Error:", responseText);
        throw new Error("Resposta inválida do serviço de consulta.");
      }

      if (result.error) {
        console.warn("[CNPJ DEBUG] API Logical Error:", result.error);
        throw new Error(result.error);
      }

      return result;
    } catch (err: any) {
      console.error("[CNPJ DEBUG] Handler Exception:", err);
      // Aqui garantimos que a mensagem final seja capturada pelo componente
      throw err;
    }
  });
