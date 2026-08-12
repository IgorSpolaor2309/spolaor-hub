// Logic for simulating AI behavior for switching accountant flow
// In a real application, we would call an AI API like OpenAI or Lovable AI Gateway.

export async function aiAnalyzeSwitching(context: string, history: any[]) {
  const text = context.toLowerCase();
  
  // Basic simulation of extraction
  const data = {
    cnpj: null as string | null,
    business_name: null as string | null,
    city: null as string | null,
    segment: null as string | null,
    revenue: null as number | null,
    employees: null as number | null,
    notes_per_month: null as number | null,
    banks: null as number | null,
    partners: null as number | null,
    tax_regime: null as string | null,
    reason_for_switching: null as string | null,
    difficulties: null as string | null,
    specific_needs: null as string | null,
    email: null as string | null,
    phone: null as string | null
  };

  // Mock extraction logic
  if (text.includes("12.345.678/0001-90")) {
    data.cnpj = "12.345.678/0001-90";
    data.business_name = "Tecnologia Inovadora LTDA";
    data.city = "São Paulo/SP";
    data.segment = "Serviços de Tecnologia";
    data.tax_regime = "Simples Nacional";
  }
  
  if (text.includes("demora muito")) data.reason_for_switching = "atendimento";
  if (text.includes("caro")) data.reason_for_switching = "preço";
  if (text.includes("50 mil")) data.revenue = 50000;
  if (text.includes("5 funcionários")) data.employees = 5;

  let response = "";
  let status: "chatting" | "complete" = "chatting";

  if (data.cnpj && data.revenue && data.reason_for_switching) {
    response = `Entendi perfeitamente! Já localizei os dados da ${data.business_name}. Compreendo que o motivo da troca é relacionado ao ${data.reason_for_switching}. Gostaria de ver como a Digital SC pode ajudar sua empresa e qual o plano ideal?`;
    status = "complete";
  } else if (!data.cnpj) {
    response = "Olá! Para começarmos a entender sua empresa, por favor, me informe o CNPJ.";
  } else if (!data.revenue) {
    response = `Localizei a ${data.business_name}! E qual o faturamento mensal aproximado de vocês hoje?`;
  } else if (!data.reason_for_switching) {
    response = "Entendido. E o que mais motiva vocês a buscarem um novo contador neste momento? (Ex: atendimento lento, custo, falta de suporte...)";
  } else {
    response = "Certo, estamos quase lá. Alguma necessidade específica que eu deva saber?";
  }

  return {
    response,
    extractedData: data,
    status
  };
}
