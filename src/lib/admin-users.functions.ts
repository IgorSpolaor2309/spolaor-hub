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

type CollaboratorData = {
  cargo?: string | null;
  departamento?: string | null;
  data_admissao?: string | null;
  status?: string | null;
  observacoes?: string | null;
};

type ClientData = {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  documento?: string | null;
  telefone?: string | null;
  tipo?: string | null;
  data_entrada?: string | null;
  status?: string | null;
  observacoes?: string | null;
};

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      password?: string | null;
      full_name: string;
      role: AppRole;
      phone?: string | null;
      // modo de vínculo: criar novo cadastro ou vincular existente
      link_mode?: "create" | "existing";
      client_id?: string | null;
      collaborator_id?: string | null;
      // dados para auto-criação
      collaborator?: CollaboratorData | null;
      client?: ClientData | null;
      // vínculos cliente-colaborador a criar
      assign_client_ids?: string[] | null;
      assign_collaborator_ids?: string[] | null;
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

    const linkMode = data.link_mode ?? "create";

    // Validações por perfil antes de criar usuário
    if (data.role === "collaborator" && linkMode === "existing" && !data.collaborator_id) {
      throw new Error("Selecione o colaborador existente para vincular.");
    }
    if (data.role === "client" && linkMode === "existing" && !data.client_id) {
      throw new Error("Selecione o cliente existente para vincular.");
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

    // profile
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
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error("Não foi possível definir o perfil de acesso.");
    }

    // vínculos / auto-criação
    let collaboratorIdResolved: string | null = null;
    let clientIdResolved: string | null = null;
    try {
      if (data.role === "collaborator") {
        if (linkMode === "existing" && data.collaborator_id) {
          const { error } = await supabaseAdmin
            .from("collaborators")
            .update({ user_id: userId })
            .eq("id", data.collaborator_id);
          if (error) throw error;
          collaboratorIdResolved = data.collaborator_id;
        } else {
          const c = data.collaborator ?? {};
          const { data: inserted, error } = await supabaseAdmin
            .from("collaborators")
            .insert({
              user_id: userId,
              nome: data.full_name,
              email,
              telefone: data.phone ?? null,
              cargo: c.cargo ?? null,
              departamento: c.departamento ?? null,
              data_admissao: c.data_admissao || null,
              status: c.status || "active",
              observacoes: c.observacoes ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          collaboratorIdResolved = inserted.id;
        }
      } else if (data.role === "client") {
        if (linkMode === "existing" && data.client_id) {
          const { error } = await supabaseAdmin
            .from("clients")
            .update({ owner_profile_id: userId })
            .eq("id", data.client_id);
          if (error) throw error;
          clientIdResolved = data.client_id;
        } else {
          const cl = data.client ?? {};
          if (!cl.razao_social?.trim()) {
            throw new Error("Informe a Razão Social do cliente.");
          }
          const { data: inserted, error } = await supabaseAdmin
            .from("clients")
            .insert({
              owner_profile_id: userId,
              razao_social: cl.razao_social,
              nome_fantasia: cl.nome_fantasia ?? null,
              documento: cl.documento ?? null,
              email,
              telefone: cl.telefone ?? data.phone ?? null,
              tipo: cl.tipo ?? null,
              data_entrada: cl.data_entrada || null,
              status: cl.status || "active",
              observacoes: cl.observacoes ?? null,
              origem_cadastro: "manual",
            })
            .select("id")
            .single();
          if (error) throw error;
          clientIdResolved = inserted.id;
        }
      }

      // vínculos cliente-colaborador
      if (data.role === "collaborator" && collaboratorIdResolved && data.assign_client_ids?.length) {
        const rows = data.assign_client_ids.map((cid) => ({
          collaborator_id: collaboratorIdResolved!,
          client_id: cid,
        }));
        const { error } = await supabaseAdmin
          .from("client_collaborators")
          .upsert(rows, { onConflict: "client_id,collaborator_id", ignoreDuplicates: true });
        if (error) throw error;
      }
      if (data.role === "client" && clientIdResolved && data.assign_collaborator_ids?.length) {
        const rows = data.assign_collaborator_ids.map((cid) => ({
          client_id: clientIdResolved!,
          collaborator_id: cid,
        }));
        const { error } = await supabaseAdmin
          .from("client_collaborators")
          .upsert(rows, { onConflict: "client_id,collaborator_id", ignoreDuplicates: true });
        if (error) throw error;
      }
    } catch (linkErr: any) {
      // rollback do usuário se o cadastro vinculado falhar
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(linkErr?.message || "Não foi possível criar o cadastro vinculado.");
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

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      user_id: string;
      full_name?: string | null;
      email?: string | null;
      phone?: string | null;
      new_password?: string | null;
      force_password_change?: boolean | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (!data.user_id) throw new Error("Usuário inválido.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const authUpdate: { email?: string; password?: string } = {};
    if (data.email != null) {
      const email = data.email.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("E-mail inválido.");
      }
      authUpdate.email = email;
    }
    if (data.new_password) {
      if (data.new_password.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
      authUpdate.password = data.new_password;
    }
    if (Object.keys(authUpdate).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, authUpdate);
      if (error) {
        throw new Error(
          error.message?.includes("already")
            ? "Já existe um usuário com este e-mail."
            : "Não foi possível atualizar os dados de acesso.",
        );
      }
    }

    const profileUpdate: {
      full_name?: string;
      email?: string;
      phone?: string | null;
      must_change_password?: boolean;
    } = {};
    if (data.full_name != null) profileUpdate.full_name = data.full_name;
    if (data.email != null) profileUpdate.email = data.email.trim().toLowerCase();
    if (data.phone !== undefined) profileUpdate.phone = data.phone;
    if (data.force_password_change || data.new_password) profileUpdate.must_change_password = true;

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", data.user_id);
      if (error) throw new Error("Não foi possível atualizar o perfil.");
    }

    return { ok: true };
  });

export const adminVerifyLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [clientsRes, collabsRes, ccRes, rolesRes, profilesRes] = await Promise.all([
      supabaseAdmin.from("clients").select("id, razao_social, status, owner_profile_id"),
      supabaseAdmin.from("collaborators").select("id, nome, status, user_id"),
      supabaseAdmin.from("client_collaborators").select("client_id, collaborator_id"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
    ]);

    const clients = clientsRes.data ?? [];
    const collaborators = collabsRes.data ?? [];
    const links = ccRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const profiles = profilesRes.data ?? [];

    const activeClients = clients.filter((c: any) => c.status === "active");
    const activeCollabs = collaborators.filter((c: any) => c.status === "active");

    const clientById = new Map(clients.map((c: any) => [c.id, c]));
    const collabById = new Map(collaborators.map((c: any) => [c.id, c]));
    const profileById = new Map(profiles.map((p: any) => [p.id, p]));

    const linkedClientIds = new Set<string>();
    const linkedCollabIds = new Set<string>();
    const seenPairs = new Set<string>();
    const duplicates: any[] = [];
    const broken: any[] = [];
    const inactiveLinks: any[] = [];

    for (const l of links as any[]) {
      const key = `${l.client_id}::${l.collaborator_id}`;
      if (seenPairs.has(key)) {
        duplicates.push(l);
        continue;
      }
      seenPairs.add(key);
      const cli: any = clientById.get(l.client_id);
      const col: any = collabById.get(l.collaborator_id);
      if (!cli || !col) {
        broken.push({ ...l, reason: !cli ? "cliente inexistente" : "colaborador inexistente" });
        continue;
      }
      linkedClientIds.add(l.client_id);
      linkedCollabIds.add(l.collaborator_id);
      if (cli.status !== "active" || col.status !== "active") {
        inactiveLinks.push({
          client: cli.razao_social,
          collaborator: col.nome,
          reason: cli.status !== "active" ? "cliente inativo" : "colaborador inativo",
        });
      }
    }

    const clientsWithoutCollab = activeClients
      .filter((c: any) => !linkedClientIds.has(c.id))
      .map((c: any) => ({ id: c.id, name: c.razao_social }));
    const collabsWithoutClient = activeCollabs
      .filter((c: any) => !linkedCollabIds.has(c.id))
      .map((c: any) => ({ id: c.id, name: c.nome }));

    const clientAccountsWithoutClient = roles
      .filter((r: any) => r.role === "client")
      .filter((r: any) => !clients.some((c: any) => c.owner_profile_id === r.user_id))
      .map((r: any) => ({ user_id: r.user_id, email: (profileById.get(r.user_id) as any)?.email ?? "—" }));
    const collabAccountsWithoutCollab = roles
      .filter((r: any) => r.role === "collaborator")
      .filter((r: any) => !collaborators.some((c: any) => c.user_id === r.user_id))
      .map((r: any) => ({ user_id: r.user_id, email: (profileById.get(r.user_id) as any)?.email ?? "—" }));

    const usersWithoutRole = profiles
      .filter((p: any) => !roles.some((r: any) => r.user_id === p.id))
      .map((p: any) => ({ user_id: p.id, email: p.email ?? "—" }));

    return {
      totals: {
        clients_active: activeClients.length,
        collaborators_active: activeCollabs.length,
        links_active: links.length - duplicates.length - broken.length,
      },
      issues: {
        clients_without_collaborator: clientsWithoutCollab,
        collaborators_without_client: collabsWithoutClient,
        client_accounts_without_client: clientAccountsWithoutClient,
        collab_accounts_without_collaborator: collabAccountsWithoutCollab,
        users_without_role: usersWithoutRole,
        duplicate_links: duplicates,
        broken_links: broken,
        inactive_links: inactiveLinks,
      },
    };
  });

export const adminDiagnoseUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = data.user_id;

    const [profileRes, rolesRes, clientRes, collabRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin.from("clients").select("id, razao_social, status").eq("owner_profile_id", userId).maybeSingle(),
      supabaseAdmin.from("collaborators").select("id, nome, status").eq("user_id", userId).maybeSingle(),
    ]);

    const role = ((rolesRes.data ?? [])[0] as any)?.role ?? null;

    let accessibleClients: { id: string; name: string }[] = [];
    if (role === "admin") {
      const { data } = await supabaseAdmin.from("clients").select("id, razao_social").order("razao_social");
      accessibleClients = (data ?? []).map((c: any) => ({ id: c.id, name: c.razao_social }));
    } else if (role === "client" && clientRes.data) {
      accessibleClients = [{ id: clientRes.data.id, name: clientRes.data.razao_social }];
    } else if (role === "collaborator" && collabRes.data) {
      const { data: cc } = await supabaseAdmin
        .from("client_collaborators")
        .select("client_id, clients(razao_social)")
        .eq("collaborator_id", collabRes.data.id);
      accessibleClients = (cc ?? []).map((x: any) => ({ id: x.client_id, name: x.clients?.razao_social ?? "—" }));
    }

    const issues: string[] = [];
    if (!role) issues.push("Conta sem perfil de acesso definido.");
    if (role === "client" && !clientRes.data) issues.push("Conta de cliente sem cadastro vinculado.");
    if (role === "collaborator" && !collabRes.data) issues.push("Conta de colaborador sem cadastro vinculado.");
    if (role === "collaborator" && collabRes.data && accessibleClients.length === 0) {
      issues.push("Colaborador sem clientes atribuídos.");
    }
    if (clientRes.data?.status === "inactive") issues.push("Cliente vinculado está inativo.");
    if (collabRes.data?.status === "inactive") issues.push("Colaborador vinculado está inativo.");

    return {
      profile: profileRes.data,
      role,
      client: clientRes.data,
      collaborator: collabRes.data,
      accessible_clients: accessibleClients,
      issues,
    };
  });

export const adminSetClientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client_id: string; status: "active" | "inactive" }) => input)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ status: data.status })
      .eq("id", data.client_id);
    if (error) throw new Error("Não foi possível atualizar o status do cliente.");
    return { ok: true };
  });

export const adminSetCollaboratorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      collaborator_id: string;
      status: "active" | "inactive";
      remove_links?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("collaborators")
      .update({ status: data.status })
      .eq("id", data.collaborator_id);
    if (error) throw new Error("Não foi possível atualizar o status do colaborador.");
    if (data.status === "inactive" && data.remove_links) {
      await supabaseAdmin
        .from("client_collaborators")
        .delete()
        .eq("collaborator_id", data.collaborator_id);
    }
    return { ok: true };
  });

