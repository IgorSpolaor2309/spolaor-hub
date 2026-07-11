import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!data) throw new Error("Apenas administradores podem acessar a Central de Homologação.");
}

export const homologSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_demo_summary");
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });

export const homologCreateEnvironment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const label = data.label?.trim() || "Ambiente demo";
    const { data: res, error } = await context.supabase.rpc("admin_demo_create_environment", { _label: label });
    if (error) {
      // registra falha amigável na auditoria (a transação da RPC já rolou back)
      await context.supabase.from("demo_audit_log").insert({
        admin_id: context.userId,
        action: "create_environment_failed",
        payload_json: { label, error: error.message },
      });
      throw new Error("Não foi possível criar o ambiente de demonstração. Nenhum dado foi gravado. Detalhe técnico: " + error.message);
    }
    return res as { batch_id: string; counts: Record<string, number> };
  });

export const homologWipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batch_id?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: res, error } = await context.supabase.rpc("admin_demo_wipe", {
      _batch_id: data.batch_id ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return res as Record<string, number>;
  });

export const homologReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: res, error } = await context.supabase.rpc("admin_demo_reset", {
      _label: data.label?.trim() || "Ambiente demo",
    });
    if (error) throw new Error(error.message);
    return res as { wiped: Record<string, number>; created: any };
  });

export const homologListBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("demo_batches")
      .select("id, label, status, counts_json, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const homologListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("demo_audit_log")
      .select("id, action, batch_id, payload_json, created_at, admin_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
