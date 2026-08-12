import { getOpenAIClient, BASE_SYSTEM_PROMPT, getDetailedCatalogContext } from "./ai-gateway.server";

export async function aiAnalyzeOpening(context: string, history: any[]) {
  const client = await getOpenAIClient();
  const catalogContext = await getDetailedCatalogContext();

  const systemPrompt = `
${BASE_SYSTEM_PROMPT}
${catalogContext}

CONTEXTO ESPECÍFICO: Abertura de Empresa.
Você deve extrair:
- name: Nome completo do interessado.
- business_type: Tipo de negócio (ex: Hamburgueria, Consultoria, E-commerce).
- city: Cidade onde a empresa será aberta.
- revenue: Faturamento mensal estimado (apenas números).
- partners: Quantidade de sócios (número).
- employees: Quantidade de funcionários (número).
- phone: Telefone de contato (preferencialmente WhatsApp).
- email: E-mail de contato.

REGRAS DE CONVERSA:
1. NÃO peça ao cliente para escolher termos técnicos como "MEI, Simples Nacional, Lucro Presumido, LTDA, SLU" etc. 
2. Colete informações sobre a atividade e o porte do negócio. Explique que o enquadramento tributário e jurídico será validado por especialistas após a contratação.
3. Se o cliente perguntar sobre impostos ou tipos de empresa, dê uma explicação geral e humana, reforçando que a Digital SC cuidará da melhor escolha técnica.

Sua resposta deve ser um JSON seguindo o esquema definido.
Pergunte o que falta de forma natural. Se já tiver o básico (nome, e-mail, telefone, tipo de negócio, cidade e faturamento estimado), marque como completo.
`;

  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
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
                name: { type: ["string", "null"] },
                business_type: { type: ["string", "null"] },
                city: { type: ["string", "null"] },
                revenue: { type: ["number", "null"] },
                partners: { type: ["number", "null"] },
                employees: { type: ["number", "null"] },
                phone: { type: ["string", "null"] },
                email: { type: ["string", "null"] }
              },
              required: ["name", "business_type", "city", "revenue", "partners", "employees", "phone", "email"],
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

