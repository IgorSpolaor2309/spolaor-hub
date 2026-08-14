import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCommercialMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertCommercialStaff, computeCommercialMetrics } = await import("./commercial-metrics.server");
    await assertCommercialStaff(context.supabase as any, context.userId);
    return computeCommercialMetrics(context.supabase as any);
  });

export const askCommercialAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ question: z.string().min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertCommercialStaff, computeCommercialMetrics } = await import("./commercial-metrics.server");
    await assertCommercialStaff(context.supabase as any, context.userId);
    const metrics = await computeCommercialMetrics(context.supabase as any);

    const { aiChat } = await import("./ai.server");

    const prompt = `Você é o Assistente Comercial da Digital SC.
    Seu objetivo é responder perguntas sobre o desempenho comercial usando os dados REAIS abaixo.
    Responda de forma objetiva, profissional e inclua os números.

    DADOS ATUAIS:
    - Leads hoje: ${metrics.today}
    - Leads nesta semana: ${metrics.week}
    - Leads neste mês: ${metrics.month}
    - Leads abandonados: ${metrics.abandoned}
    - Leads em contratação (intenção): ${metrics.intent}
    - Leads sem responsável: ${metrics.unassigned}
    - Leads com ação atrasada: ${metrics.overdue}
    - Plano mais recomendado: ${metrics.topPlan}
    - Taxa de conversão (Leads -> Intenção): ${metrics.conversionRate}
    - Total histórico de leads: ${metrics.total}

    REGRAS:
    - Não invente dados.
    - Se perguntarem algo fora desses dados, diga que não tem acesso a essa informação específica no momento.
    - Mantenha a resposta curta e em português.

    PERGUNTA DO USUÁRIO: ${data.question}`;

    const response = await aiChat("gpt-4o-mini", [
      { role: "system", content: "Você é um analista comercial preciso." },
      { role: "user", content: prompt },
    ]);

    return {
      answer: response,
      metrics,
    };
  });
