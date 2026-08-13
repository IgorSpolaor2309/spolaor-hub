import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const getCommercialMetrics = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Check if user is admin/collaborator
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    
    if (profile?.role !== 'admin' && profile?.role !== 'collaborator') {
      throw new Error("Forbidden");
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Queries controladas para métricas
    const [
      todayLeads,
      weekLeads,
      monthLeads,
      abandonedLeads,
      intentLeads,
      unassignedLeads,
      overdueLeads,
      planStats,
      totalLeads
    ] = await Promise.all([
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).gte("created_at", startOfDay),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).gte("created_at", startOfWeek),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).eq("status_comercial", "abandonado"),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).eq("status_comercial", "contratação_em_andamento"),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).is("responsible_profile_id", null),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true }).lt("next_action_date", now.toISOString()).not("status_comercial", "in", "(perdido,abandonado)"),
      (supabase as any).from("commercial_prospects").select("plan_id"),
      (supabase as any).from("commercial_prospects").select("id", { count: "exact", head: true })
    ]);

    // Calcular plano mais recomendado
    const planCounts = (planStats.data || []).reduce((acc: any, curr: any) => {
      if (curr.plan_id) acc[curr.plan_id] = (acc[curr.plan_id] || 0) + 1;
      return acc;
    }, {});
    
    let topPlanId = null;
    let max = 0;
    for (const id in planCounts) {
      if (planCounts[id] > max) {
        max = planCounts[id];
        topPlanId = id;
      }
    }

    let topPlanName = "Nenhum";
    if (topPlanId) {
      const { data: planData } = await (supabase as any).from("plans").select("nome").eq("id", topPlanId).single();
      topPlanName = planData?.nome || "Nenhum";
    }

    return {
      today: todayLeads.count || 0,
      week: weekLeads.count || 0,
      month: monthLeads.count || 0,
      abandoned: abandonedLeads.count || 0,
      intent: intentLeads.count || 0,
      unassigned: unassignedLeads.count || 0,
      overdue: overdueLeads.count || 0,
      total: totalLeads.count || 0,
      topPlan: topPlanName,
      conversionRate: totalLeads.count ? ((intentLeads.count || 0) / totalLeads.count * 100).toFixed(1) + "%" : "0%"
    };
  });

export const askCommercialAi = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ question: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const metrics = await getCommercialMetrics();
    
    // Using existing OpenAI integration flow (simulated here since we use server-side AI tools normally)
    // In a real scenario we'd call the gateway or openai helper
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
      { role: "user", content: prompt }
    ]);

    return { 
      answer: response,
      metrics // Passamos as métricas para a UI exibir se quiser
    };
  });
