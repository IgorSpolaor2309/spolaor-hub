import { getOpenAIClient, BASE_SYSTEM_PROMPT, getDetailedCatalogContext } from "./ai-gateway.server";

export async function aiAnalyzeSwitching(context: string, history: any[]) {
  const client = await getOpenAIClient();
  const catalogContext = await getDetailedCatalogContext();

  const systemPrompt = `
${BASE_SYSTEM_PROMPT}
${catalogContext}

CONTEXTO ESPECÍFICO: Troca de Contador (Migração).
Você deve extrair dados da empresa atual do cliente.
- cnpj: CNPJ da empresa (se informado).
- business_name: Razão Social ou Nome Fantasia.
- revenue: Faturamento mensal médio (número).
- reason_for_switching: Motivo da troca (atendimento, custo, tecnologia, etc).
- tax_regime: Regime tributário (Simples Nacional, Lucro Presumido, etc).

Sua resposta deve ser um JSON. Se o cliente informar o CNPJ, simule que encontrou os dados (seja criativo mas profissional).
Se já tiver CNPJ, faturamento e motivo da troca, marque o status como 'complete'.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' as const : 'user' as const, content: h.content })),
      { role: "user", content: context }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "switching_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            response: { type: "string" },
            extractedData: {
              type: "object",
              properties: {
                cnpj: { type: ["string", "null"] },
                business_name: { type: ["string", "null"] },
                revenue: { type: ["number", "null"] },
                reason_for_switching: { type: ["string", "null"] },
                tax_regime: { type: ["string", "null"] }
              },
              required: ["cnpj", "business_name", "revenue", "reason_for_switching", "tax_regime"],
              additionalProperties: false
            },
            status: { type: "string", enum: ["chatting", "complete"] }
          },
          required: ["response", "extractedData", "status"],
          additionalProperties: false
        }
      }
    }
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result;
}

