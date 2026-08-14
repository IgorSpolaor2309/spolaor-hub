import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertCommercialStaff(client: SupabaseClient<any>, userId: string) {
  const { data, error } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "collaborator"]);

  if (error) {
    console.error("[commercial-metrics] role lookup failed:", error);
    throw new Error("Forbidden");
  }
  if (!data || data.length === 0) throw new Error("Forbidden");
}

export async function computeCommercialMetrics(client: SupabaseClient<any>) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(new Date(now).setDate(now.getDate() - now.getDay())).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nowIso = now.toISOString();

  const table = () => (client as any).from("commercial_prospects");

  const [
    todayLeads,
    weekLeads,
    monthLeads,
    abandonedLeads,
    intentLeads,
    unassignedLeads,
    overdueLeads,
    planStats,
    totalLeads,
  ] = await Promise.all([
    table().select("id", { count: "exact", head: true }).gte("created_at", startOfDay),
    table().select("id", { count: "exact", head: true }).gte("created_at", startOfWeek),
    table().select("id", { count: "exact", head: true }).gte("created_at", startOfMonth),
    table().select("id", { count: "exact", head: true }).eq("status_comercial", "abandonado"),
    table().select("id", { count: "exact", head: true }).eq("status_comercial", "contratação_em_andamento"),
    table().select("id", { count: "exact", head: true }).is("responsible_profile_id", null),
    table()
      .select("id", { count: "exact", head: true })
      .lt("next_action_date", nowIso)
      .not("status_comercial", "in", "(perdido,abandonado)"),
    table().select("plan_id"),
    table().select("id", { count: "exact", head: true }),
  ]);

  const planCounts = (planStats.data || []).reduce((acc: any, curr: any) => {
    if (curr.plan_id) acc[curr.plan_id] = (acc[curr.plan_id] || 0) + 1;
    return acc;
  }, {});

  let topPlanId: string | null = null;
  let max = 0;
  for (const id in planCounts) {
    if (planCounts[id] > max) {
      max = planCounts[id];
      topPlanId = id;
    }
  }

  let topPlanName = "Nenhum";
  if (topPlanId) {
    const { data: planData } = await (client as any)
      .from("plans")
      .select("nome")
      .eq("id", topPlanId)
      .maybeSingle();
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
    conversionRate: totalLeads.count
      ? ((intentLeads.count || 0) / totalLeads.count * 100).toFixed(1) + "%"
      : "0%",
  };
}
