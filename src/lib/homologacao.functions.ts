import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomBytes } from "node:crypto";

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

function randomPassword() {
  // 24 bytes → 32 base64 chars, high entropy, throwaway. Never stored, never shown.
  return randomBytes(24).toString("base64").replace(/[^A-Za-z0-9]/g, "") + "!Aa9";
}

function timestampSuffix() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

type PersonaSpec = {
  label: string;
  role: "admin" | "collaborator" | "client";
  full_name: string;
  email: string;
};

function buildPersonaSpecs(): PersonaSpec[] {
  const t = timestampSuffix();
  const domain = "homolog.spolaor.local";
  return [
    { label: "Admin (demo)",           role: "admin",        full_name: "[DEMO] Admin Homologação",       email: `demo-admin-${t}@${domain}` },
    { label: "Colaborador Contábil (demo)", role: "collaborator", full_name: "[DEMO] Colaborador Contábil",  email: `demo-collab1-${t}@${domain}` },
    { label: "Colaborador Fiscal (demo)",   role: "collaborator", full_name: "[DEMO] Colaborador Fiscal",    email: `demo-collab2-${t}@${domain}` },
    { label: "Cliente — Em dia",        role: "client",       full_name: "[DEMO] Cliente Em Dia",         email: `demo-cliente1-${t}@${domain}` },
    { label: "Cliente — Com pendências",role: "client",       full_name: "[DEMO] Cliente Pendências",     email: `demo-cliente2-${t}@${domain}` },
    { label: "Cliente — Onboarding",    role: "client",       full_name: "[DEMO] Cliente Onboarding",     email: `demo-cliente3-${t}@${domain}` },
  ];
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const specs = buildPersonaSpecs();
    const created: { user_id: string; spec: PersonaSpec }[] = [];

    // Step 1: create auth users with throwaway random passwords (never stored, never returned)
    try {
      for (const spec of specs) {
        const { data: u, error } = await supabaseAdmin.auth.admin.createUser({
          email: spec.email,
          password: randomPassword(),
          email_confirm: true,
          user_metadata: { full_name: spec.full_name, demo: true },
        });
        if (error || !u.user) throw new Error(`Falha ao criar conta ${spec.label}: ${error?.message ?? "desconhecido"}`);
        created.push({ user_id: u.user.id, spec });
      }
    } catch (err: any) {
      // rollback partial auth users
      for (const c of created) {
        try { await supabaseAdmin.auth.admin.deleteUser(c.user_id); } catch { /* ignore */ }
      }
      await context.supabase.from("demo_audit_log").insert({
        admin_id: context.userId,
        action: "create_environment_failed",
        payload_json: { label, phase: "auth_users", error: err?.message ?? String(err) },
      });
      throw new Error("Não foi possível criar as contas demo. Nenhum dado foi gravado. " + (err?.message ?? ""));
    }

    // Step 2: seed batch data linked to those auth users
    const personasPayload = created.map((c) => ({
      user_id: c.user_id,
      role: c.spec.role,
      full_name: c.spec.full_name,
      email: c.spec.email,
      label: c.spec.label,
    }));
    const { data: seed, error: seedErr } = await context.supabase.rpc("admin_demo_seed_batch", {
      _label: label,
      _personas: personasPayload,
    });
    if (seedErr) {
      for (const c of created) {
        try { await supabaseAdmin.auth.admin.deleteUser(c.user_id); } catch { /* ignore */ }
      }
      await context.supabase.from("demo_audit_log").insert({
        admin_id: context.userId,
        action: "create_environment_failed",
        payload_json: { label, phase: "seed", error: seedErr.message },
      });
      throw new Error("Não foi possível popular o ambiente demo. Contas revertidas. Detalhe: " + seedErr.message);
    }

    // Step 3: generate ephemeral magic links per persona (not persisted anywhere)
    const personas: Array<{ label: string; role: string; email: string; magic_link: string | null }> = [];
    for (const c of created) {
      try {
        const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: c.spec.email,
        });
        personas.push({
          label: c.spec.label,
          role: c.spec.role,
          email: c.spec.email,
          magic_link: error ? null : (link?.properties?.action_link ?? null),
        });
      } catch {
        personas.push({ label: c.spec.label, role: c.spec.role, email: c.spec.email, magic_link: null });
      }
    }

    // Audit: only who/when/roles — no links, no passwords
    await context.supabase.from("demo_audit_log").insert({
      admin_id: context.userId,
      action: "personas_provisioned",
      batch_id: (seed as any)?.batch_id ?? null,
      payload_json: {
        roles: personas.map((p) => p.role),
        count: personas.length,
      },
    });

    return {
      batch_id: (seed as any)?.batch_id,
      counts: (seed as any)?.counts ?? {},
      personas,
    };
  });

export const homologWipePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batch_id?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: res, error } = await context.supabase.rpc("admin_demo_wipe_preview", {
      _batch_id: data.batch_id ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return res as Record<string, number>;
  });

export const homologWipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batch_id?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);

    // 1. Collect demo auth user ids BEFORE wiping profiles
    const { data: personaRows, error: personaErr } = await context.supabase.rpc("admin_demo_persona_user_ids", {
      _batch_id: data.batch_id ?? undefined,
    } as any);
    if (personaErr) throw new Error(personaErr.message);
    const demoUserIds: string[] = ((personaRows ?? []) as any[]).map((r) => r.user_id).filter(Boolean);

    // 2. Wipe DB (transactional)
    const { data: res, error } = await context.supabase.rpc("admin_demo_wipe", {
      _batch_id: data.batch_id ?? undefined,
    } as any);
    if (error) {
      await context.supabase.from("demo_audit_log").insert({
        admin_id: context.userId,
        action: "wipe_failed",
        payload_json: { batch_id: data.batch_id ?? null, error: error.message },
      });
      throw new Error("Não foi possível limpar os dados de demonstração. Nenhum registro foi removido. Detalhe: " + error.message);
    }

    // 3. Delete auth users (and force sign-out) — after DB wipe succeeded
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let authDeleted = 0;
    let authFailed = 0;
    for (const uid of demoUserIds) {
      try {
        try { await supabaseAdmin.auth.admin.signOut(uid, "global"); } catch { /* ignore */ }
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
        if (delErr) authFailed++; else authDeleted++;
      } catch {
        authFailed++;
      }
    }

    await context.supabase.from("demo_audit_log").insert({
      admin_id: context.userId,
      action: "auth_users_wiped",
      batch_id: data.batch_id ?? null,
      payload_json: { auth_deleted: authDeleted, auth_failed: authFailed, targeted: demoUserIds.length },
    });

    return { ...(res as Record<string, number>), auth_users_deleted: authDeleted, auth_users_failed: authFailed };
  });

export const homologReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);

    // Use the composed pipeline: wipe (with auth cleanup) then create
    // Reuse the two handlers to avoid duplicating auth logic. Directly invoke via the same context.
    // We can't call other serverFns here as handlers, so replicate the flow inline:
    const wipeResult = await (async () => {
      const { data: rows } = await context.supabase.rpc("admin_demo_persona_user_ids", { _batch_id: undefined } as any);
      const ids: string[] = ((rows ?? []) as any[]).map((r) => r.user_id).filter(Boolean);
      const { data: wiped, error } = await context.supabase.rpc("admin_demo_wipe", { _batch_id: undefined } as any);
      if (error) throw new Error(error.message);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const uid of ids) {
        try { await supabaseAdmin.auth.admin.signOut(uid, "global"); } catch { /* noop */ }
        try { await supabaseAdmin.auth.admin.deleteUser(uid); } catch { /* noop */ }
      }
      return wiped;
    })();

    // Create fresh environment
    const label = data.label?.trim() || "Ambiente demo";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const specs = buildPersonaSpecs();
    const created: { user_id: string; spec: PersonaSpec }[] = [];
    for (const spec of specs) {
      const { data: u, error } = await supabaseAdmin.auth.admin.createUser({
        email: spec.email,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { full_name: spec.full_name, demo: true },
      });
      if (error || !u.user) throw new Error(`Falha ao criar conta demo: ${error?.message}`);
      created.push({ user_id: u.user.id, spec });
    }
    const personasPayload = created.map((c) => ({
      user_id: c.user_id, role: c.spec.role, full_name: c.spec.full_name, email: c.spec.email, label: c.spec.label,
    }));
    const { data: seed, error: seedErr } = await context.supabase.rpc("admin_demo_seed_batch", {
      _label: label,
      _personas: personasPayload,
    });
    if (seedErr) {
      for (const c of created) { try { await supabaseAdmin.auth.admin.deleteUser(c.user_id); } catch { /* noop */ } }
      throw new Error(seedErr.message);
    }
    const personas: Array<{ label: string; role: string; email: string; magic_link: string | null }> = [];
    for (const c of created) {
      try {
        const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: c.spec.email });
        personas.push({
          label: c.spec.label, role: c.spec.role, email: c.spec.email,
          magic_link: error ? null : (link?.properties?.action_link ?? null),
        });
      } catch {
        personas.push({ label: c.spec.label, role: c.spec.role, email: c.spec.email, magic_link: null });
      }
    }
    return { wiped: wipeResult, created: { batch_id: (seed as any)?.batch_id, counts: (seed as any)?.counts ?? {}, personas } };
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

export const homologContaminationReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_demo_contamination_report");
    if (error) throw new Error(error.message);
    return data as Record<string, any[]>;
  });

export const homologRepairCaseA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_demo_repair_case_a");
    if (error) throw new Error(error.message);
    return data as { processes_fixed: number; steps_fixed: number };
  });

export const homologValidateBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batch_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!data.batch_id) throw new Error("Selecione um lote demo para validar.");
    const { data: res, error } = await context.supabase.rpc("admin_demo_validate_batch", {
      p_batch_id: data.batch_id,
    } as any);
    if (error) throw new Error(error.message);
    return res as {
      batch_id: string;
      label: string;
      overall: "pass" | "warn" | "fail";
      checks: Array<{ code: string; label: string; status: "pass" | "warn" | "fail"; detail: string; count?: number }>;
      validated_at: string;
    };
  });

export const homologPurgeOrphanAuthUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_demo_orphan_auth_user_ids");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ user_id: string; email: string }>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let deleted = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        try { await supabaseAdmin.auth.admin.signOut(r.user_id, "global"); } catch { /* noop */ }
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(r.user_id);
        if (delErr) failed++; else deleted++;
      } catch {
        failed++;
      }
    }
    await context.supabase.from("demo_audit_log").insert({
      admin_id: context.userId,
      action: "orphan_auth_users_purged",
      payload_json: { candidates: rows.length, deleted, failed },
    });
    return { candidates: rows.length, deleted, failed };
  });

export const homologListValidationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batch_id?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.rpc("admin_demo_list_validation_runs", {
      _batch_id: data.batch_id ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const homologListManualSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { run_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!data.run_id) throw new Error("run_id obrigatório");
    const { data: rows, error } = await context.supabase.rpc("admin_demo_list_manual_steps", {
      _run_id: data.run_id,
    } as any);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const homologUpdateManualStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { step_id: string; status: "pending" | "pass" | "fail" | "skip"; notes?: string | null }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase.rpc("admin_demo_update_manual_step", {
      _step_id: data.step_id,
      _status: data.status,
      _notes: data.notes ?? null,
    } as any);
    if (error) throw new Error(error.message);
    return row as any;
  });
