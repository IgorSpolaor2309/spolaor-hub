import OpenAI from "openai";
import { getPublicPlans, getPublicServices } from "./public-catalog.functions";

export async function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the backend.");
  }
  return new OpenAI({ apiKey });
}

export const BASE_SYSTEM_PROMPT = `
Você é a IA da Digital SC, uma contabilidade digital moderna e humana.
Seu objetivo é conversar com potenciais clientes na landing page para entender o negócio deles e recomendar a melhor solução.

REGRAS CRÍTICAS:
1. NUNCA invente planos, preços, taxas ou serviços que não estejam no catálogo fornecido.
2. Seja conciso e direto. Evite textos longos.
3. Se o cliente perguntar algo fora do escopo de abertura/migração de empresa, direcione-o gentilmente de volta ao fluxo.
4. Mantenha um tom profissional, mas acolhedor (uso de "você", linguagem clara).
5. Se houver erro ou dúvida, peça para o cliente esclarecer.
6. Use os dados do catálogo real para explicar por que um plano foi recomendado.

CATÁLOGO REAL (Digital SC):
`;

export async function getDetailedCatalogContext() {
  const [plans, services] = await Promise.all([
    getPublicPlans(),
    getPublicServices()
  ]);

  const plansCtx = plans.map((p: any) => 
    `- ${p.nome}: ${p.publico_alvo}. Preço: ${p.tipo_preco === 'sob_orcamento' ? 'Sob orçamento' : 'R$ ' + p.valor_padrao + '/mês'}. Faturamento até: ${p.limite_faturamento || 'Ilimitado'}.`
  ).join('\n');

  const servicesCtx = services.map((s: any) => `- ${s.nome}: ${s.descricao}`).join('\n');


  return `
PLANOS DISPONÍVEIS:
${plansCtx}

SERVIÇOS DISPONÍVEIS:
${servicesCtx}
`;
}
