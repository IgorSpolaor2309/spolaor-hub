import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AppRole = "admin" | "collaborator" | "client";

async function ensureAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Não foi possível verificar suas permissões.");
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}

const DEFAULT_PROVISIONAL_PASSWORD = "Spolaor@123";

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password?: string | null;
      full_name: string;
      role: AppRole;
      phone?: string | null;
      client_id?: string | null;
      collaborator_id?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);

    const email = data.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("E-mail inválido.");
    }
    const password = (data.password && data.password.length >= 8)
      ? data.password
      : DEFAULT_PROVISIONAL_PASSWORD;
    if (!data.full_name?.trim()) {
      throw new Error("Informe o nome completo.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message?.includes("already registered")
        ? "Já existe um usuário com este e-mail."
        : "Não foi possível criar o usuário.");
    }

    const userId = created.user.id;

    // garantir profile (trigger já cria, mas reforçamos campos + flag de troca obrigatória)
    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: data.full_name,
      email,
      phone: data.phone ?? null,
      must_change_password: true,
    });

    // perfil de acesso
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: data.role });
    if (roleErr) throw new Error("Não foi possível definir o perfil de acesso.");

    // vínculos
    if (data.role === "client" && data.client_id) {
      await supabaseAdmin
        .from("clients")
        .update({ owner_profile_id: userId })
        .eq("id", data.client_id);
    }
    if (data.role === "collaborator" && data.collaborator_id) {
      await supabaseAdmin
        .from("collaborators")
        .update({ user_id: userId })
        .eq("id", data.collaborator_id);
    }

    return { ok: true, user_id: userId, provisional_password: password };
  });


export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: AppRole }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_user_role", {
      _user_id: data.user_id,
      _role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) {
      throw new Error("Você não pode excluir a própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error("Não foi possível excluir o usuário.");
    return { ok: true };
  });
