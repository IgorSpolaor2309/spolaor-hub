import { getOpenAIClient, BASE_SYSTEM_PROMPT, getDetailedCatalogContext, getContractRequirementsContext } from "./ai-gateway.server";

export async function aiAnalyzeSwitching(context: string, history: any[]) {
  const client = await getOpenAIClient();
  const catalogContext = await getDetailedCatalogContext();
  const contractRequirements = await getContractRequirementsContext();

  const systemPrompt = `
${BASE_SYSTEM_PROMPT}
${catalogContext}
${contractRequirements}

 CONTEXTO ESPECÍFICO: Troca de Contador (Migração).
 Você deve conversar com o cliente para entender as necessidades dele.
- business_name: Razão Social ou Nome Fantasia (já identificado pelo sistema).
- revenue: Faturamento mensal médio (número).
- reason_for_switching: Motivo da troca (atendimento, custo, tecnologia, etc).
- tax_regime: Regime tributário (Simples Nacional, Lucro Presumido, etc).
- phone: Telefone de contato.
- email: E-mail de contato.
- name: Nome do contato.

 REGRAS DE CONVERSA:
 1. A identificação da empresa pelo CNPJ já foi feita externamente. NÃO tente adivinhar ou inventar dados do CNPJ.
 2. Se o cliente falar um CNPJ, ignore-o tecnicamente (ele já foi processado) e foque no faturamento e motivo da troca.
 3. Se o faturamento for superior aos limites dos planos padrão descritos no catálogo ou a operação parecer complexa demais, sugira uma Solução Personalizada e oriente a falar com a equipe.
 4. CRITÉRIO DE CONCLUSÃO (status = 'complete'): Marque como completo SOMENTE quando tiver coletado Nome, E-mail, Telefone, Faturamento, Motivo da troca e o CPF do representante. O Endereço geralmente já vem do CNPJ, mas se estiver faltando no contexto, pergunte.
 5. Seja profissional e acolhedor.
 6. Mantenha a conversa natural, peça um dado por vez.
 7. Se já tiver informações suficientes para o diagnóstico e o contrato, informe ao usuário que o plano de transição está pronto.
 8. A identificação da empresa pelo CNPJ já foi feita. Foque em completar o que falta para o contrato e diagnóstico.
 9. IMPORTANTE: Não invente dados. Se não souber, pergunte.
 `;

  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
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
                name: { type: ["string", "null"] },
                cnpj: { type: ["string", "null"] },
                business_name: { type: ["string", "null"] },
                revenue: { type: ["number", "null"] },
                reason_for_switching: { type: ["string", "null"] },
                tax_regime: { type: ["string", "null"] },
                phone: { type: ["string", "null"] },
                email: { type: ["string", "null"] }
              },
              required: ["name", "cnpj", "business_name", "revenue", "reason_for_switching", "tax_regime", "phone", "email"],
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

