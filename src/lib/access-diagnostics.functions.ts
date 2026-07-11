import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ClientPageRow = any & {
  id: string;
  client_fiscal_data: Record<string, unknown> | null;
  client_collaborators: Array<{
    collaborator_id: string;
    collaborators: { id: string; nome: string | null } | null;
  }>;
  client_users: Array<{ id: string; ativo: boolean | null }>;
  client_commercial: Record<string, unknown> | null;
};

export const getAdminClientsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Não foi possível verificar suas permissões.");
    if (!role) throw new Error("Apenas administradores podem listar todas as empresas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (clientsError) throw new Error(clientsError.message);

    const ids = (clients ?? []).map((client: any) => client.id as string);
    if (ids.length === 0) return [] as ClientPageRow[];

    const [fiscalRes, collabLinksRes, usersRes, commercialRes] = await Promise.all([
      supabaseAdmin
        .from("client_fiscal_data")
        .select("client_id, regime_tributario, uf, municipio")
        .in("client_id", ids),
      supabaseAdmin
        .from("client_collaborators")
        .select("client_id, collaborator_id, collaborators(id, nome)")
        .in("client_id", ids),
      supabaseAdmin
        .from("client_users")
        .select("id, client_id, ativo")
        .in("client_id", ids),
      supabaseAdmin
        .from("client_commercial")
        .select("client_id, tipo_cliente, plano, status_comercial, periodicidade")
        .in("client_id", ids),
    ]);

    const firstError = fiscalRes.error ?? collabLinksRes.error ?? usersRes.error ?? commercialRes.error;
    if (firstError) throw new Error(firstError.message);

    const fiscalByClient = new Map((fiscalRes.data ?? []).map((row: any) => [row.client_id, row]));
    const usersByClient = new Map<string, any[]>();
    for (const row of usersRes.data ?? []) {
      const list = usersByClient.get((row as any).client_id) ?? [];
      list.push({ id: (row as any).id, ativo: (row as any).ativo });
      usersByClient.set((row as any).client_id, list);
    }
    const collabsByClient = new Map<string, any[]>();
    for (const row of collabLinksRes.data ?? []) {
      const list = collabsByClient.get((row as any).client_id) ?? [];
      list.push({
        collaborator_id: (row as any).collaborator_id,
        collaborators: (row as any).collaborators ?? null,
      });
      collabsByClient.set((row as any).client_id, list);
    }
    const commercialByClient = new Map((commercialRes.data ?? []).map((row: any) => [row.client_id, row]));

    return (clients ?? []).map((client: any) => ({
      ...client,
      client_fiscal_data: fiscalByClient.get(client.id) ?? null,
      client_collaborators: collabsByClient.get(client.id) ?? [],
      client_users: usersByClient.get(client.id) ?? [],
      client_commercial: commercialByClient.get(client.id) ?? null,
    })) as ClientPageRow[];
  });

export const getAdminCollaboratorsPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Não foi possível verificar suas permissões.");
    if (!role) throw new Error("Apenas administradores podem listar todos os colaboradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("collaborators")
      .select("id, nome, email, telefone, cargo, departamento, data_admissao, status, observacoes, user_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const homologAccessDiagnostic = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: adminRole, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error("Não foi possível verificar suas permissões.");
    if (!adminRole) throw new Error("Apenas administradores podem acessar o diagnóstico.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profileRes, rolesRes, collaboratorRes, visibleClientsRes, visibleCollaboratorsRes, totalCollaboratorsRes] = await Promise.all([
      context.supabase.from("profiles").select("id, full_name, email, status").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("collaborators").select("id, nome, email, status, user_id").eq("user_id", context.userId).maybeSingle(),
      context.supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, status, is_demo")
        .is("deleted_at", null)
        .order("razao_social"),
      context.supabase.from("collaborators").select("id, nome, email, status, user_id").order("created_at", { ascending: false }),
      supabaseAdmin.from("collaborators").select("id", { head: true, count: "exact" }),
    ]);

    const pageClientsRes = await context.supabase
      .from("clients")
      .select("*, client_fiscal_data(regime_tributario, uf, municipio), client_collaborators(collaborator_id, collaborators(id, nome)), client_users(id, ativo), client_commercial(tipo_cliente, plano, status_comercial, periodicidade)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const [adminClientsRes, allProfilesRes, allRolesRes, allCollaboratorsRes, allLinksRes, authUsersRes] = await Promise.all([
      supabaseAdmin.from("clients").select("id, razao_social, nome_fantasia, status, is_demo, deleted_at").is("deleted_at", null).order("razao_social"),
      supabaseAdmin.from("profiles").select("id, full_name, email, status"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("collaborators").select("id, nome, email, status, user_id"),
      supabaseAdmin.from("client_collaborators").select("client_id, collaborator_id"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const adminClients = adminClientsRes.data ?? [];
    const profiles = allProfilesRes.data ?? [];
    const roles = allRolesRes.data ?? [];
    const collaborators = allCollaboratorsRes.data ?? [];
    const links = allLinksRes.data ?? [];
    const authUsers = authUsersRes.data?.users ?? [];
    const includesPerson = (value: string | null | undefined) => {
      const s = (value ?? "").toLowerCase();
      return s.includes("bruno") || s.includes("igor");
    };

    const targetUserIds = new Set<string>();
    for (const user of authUsers) {
      if (includesPerson(user.email) || includesPerson((user.user_metadata as any)?.full_name)) targetUserIds.add(user.id);
    }
    for (const profile of profiles as any[]) {
      if (includesPerson(profile.full_name) || includesPerson(profile.email)) targetUserIds.add(profile.id);
    }
    for (const collaborator of collaborators as any[]) {
      if (includesPerson(collaborator.nome) || includesPerson(collaborator.email) || collaborator.user_id && targetUserIds.has(collaborator.user_id)) {
        if (collaborator.user_id) targetUserIds.add(collaborator.user_id);
      }
    }

    const targetAccounts = Array.from(targetUserIds).map((userId) => {
      const authUser = authUsers.find((user) => user.id === userId);
      const profile = (profiles as any[]).find((profile) => profile.id === userId) ?? null;
      const userRoles = (roles as any[]).filter((role) => role.user_id === userId).map((role) => role.role);
      const collaborator = (collaborators as any[]).find((collaborator) => collaborator.user_id === userId) ?? null;
      const linkedClientIds = collaborator
        ? (links as any[]).filter((link) => link.collaborator_id === collaborator.id).map((link) => link.client_id)
        : [];
      const linkedClients = (adminClients as any[])
        .filter((client) => linkedClientIds.includes(client.id))
        .map((client) => ({ id: client.id, razao_social: client.razao_social, status: client.status, is_demo: client.is_demo }));
      return {
        user_id: userId,
        auth_email: authUser?.email ?? null,
        profile,
        roles: userRoles,
        collaborator,
        linked_clients: linkedClients,
        accessible_clients_count: linkedClients.filter((client: any) => client.status !== "inactive").length,
      };
    });

    return {
      current_user: context.userId,
      current_roles: (rolesRes.data ?? []).map((role: any) => role.role),
      current_profile: profileRes.data ?? null,
      current_collaborator: collaboratorRes.data ?? null,
      current_status: profileRes.data?.status ?? null,
      accessible_companies_count: visibleClientsRes.data?.length ?? 0,
      accessible_companies: visibleClientsRes.data ?? [],
      total_collaborators: totalCollaboratorsRes.count ?? 0,
      visible_collaborators_count: visibleCollaboratorsRes.data?.length ?? 0,
      visible_collaborators: visibleCollaboratorsRes.data ?? [],
      last_errors: {
        empresas: pageClientsRes.error?.message ?? visibleClientsRes.error?.message ?? null,
        colaboradores: visibleCollaboratorsRes.error?.message ?? null,
        perfil: profileRes.error?.message ?? null,
        papeis: rolesRes.error?.message ?? null,
        auth_users: authUsersRes.error?.message ?? null,
      },
      page_query_counts: {
        empresas: pageClientsRes.data?.length ?? 0,
        colaboradores: visibleCollaboratorsRes.data?.length ?? 0,
      },
      target_accounts: targetAccounts,
    };
  });