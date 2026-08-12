import { getOpenAIClient, BASE_SYSTEM_PROMPT, getDetailedCatalogContext } from "./ai-gateway.server";

export async function aiAnalyzeOpening(context: string, history: any[]) {
  const client = await getOpenAIClient();
  const catalogContext = await getDetailedCatalogContext();

  const systemPrompt = `
${BASE_SYSTEM_PROMPT}
${catalogContext}

CONTEXTO ESPECÍFICO: Abertura de Empresa.
Você deve extrair:
- business_type: Tipo de negócio (ex: Hamburgueria, Consultoria, E-commerce).
- city: Cidade onde a empresa será aberta.
- revenue: Faturamento mensal estimado (apenas números).
- partners: Quantidade de sócios (número).
- employees: Quantidade de funcionários (número).

Sua resposta deve ser um JSON seguindo o esquema definido.
Pergunte o que falta de forma natural. Se já tiver o básico (tipo, cidade, faturamento), marque como completo.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role === 'ai' ? 'assistant' as const : 'user' as const, content: h.content })),
      { role: "user", content: context }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "opening_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            response: { type: "string", description: "Sua resposta natural para o usuário." },
            extractedData: {
              type: "object",
              properties: {
                business_type: { type: ["string", "null"] },
                city: { type: ["string", "null"] },
                revenue: { type: ["number", "null"] },
                partners: { type: ["number", "null"] },
                employees: { type: ["number", "null"] }
              },
              required: ["business_type", "city", "revenue", "partners", "employees"],
              additionalProperties: false
            },
            isComplete: { type: "boolean", description: "Verdadeiro se você já tiver informações suficientes (tipo, cidade, faturamento) para recomendar um plano." }
          },
          required: ["response", "extractedData", "isComplete"],
          additionalProperties: false
        }
      }
    }
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return result;
}

