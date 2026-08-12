// Logic for simulating AI behavior without external dependencies
// In a real application, we would call an AI API like OpenAI or Lovable AI Gateway.

export async function aiAnalyzeOpening(context: string, history: any[]) {
  const text = context.toLowerCase();
  
  // Basic simulation of extraction
  const data = {
    name: null as string | null,
    city: null as string | null,
    business_type: null as string | null,
    employees: null as number | null,
    revenue: null as number | null,
    partners: null as number | null
  };

  if (text.includes("hamburgueria")) data.business_type = "Hamburgueria";
  if (text.includes("santos")) data.city = "Santos/SP";
  if (text.includes("irmão")) data.partners = 1;
  if (text.includes("8 funcionários")) data.employees = 8;
  if (text.includes("150 mil")) data.revenue = 150000;

  let response = "";
  let isComplete = false;

  if (data.business_type && data.city && data.revenue) {
    response = `Entendi perfeitamente! Uma ${data.business_type} em ${data.city} com faturamento de R$ ${data.revenue.toLocaleString()} é um projeto excelente. Já identifiquei que você terá sócios e equipe. Gostaria de ver um diagnóstico inicial e o plano recomendado?`;
    isComplete = true;
  } else if (!data.business_type) {
    response = "Que legal! Conte-me mais: qual o tipo de negócio que você pretende abrir?";
  } else if (!data.city) {
    response = `Uma ${data.business_type}! Ótima escolha. Em qual cidade você pretende abrir?`;
  } else {
    response = "Certo, entendi. E qual o faturamento mensal que você estima para os primeiros meses?";
  }

  return {
    response,
    extractedData: data,
    isComplete
  };
}
