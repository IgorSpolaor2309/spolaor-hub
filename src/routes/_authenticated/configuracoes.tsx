import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Trash2, Pencil, ShieldCheck, Package, GitBranch, MessagesSquare, FlaskConical, Plug, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  adminCreateUser, adminSetUserRole, adminDeleteUser, adminUpdateUser,
  adminVerifyLinks, adminDiagnoseUser, adminLinkClientAccount,
} from "@/lib/admin-users.functions";
import { MultiSelect } from "@/components/sc/MultiSelect";
import { CnpjLookup, type ReceitaData } from "@/components/sc/CnpjLookup";
import { mapReceitaToForm } from "@/lib/receita-map";


export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
});

type UserRow = { id: string; full_name: string | null; email: string | null; phone: string | null; roles: string[] };

function friendly(err: any) {
  const raw = err?.message ?? "";
  if (/row-level security|permission|42501/i.test(raw)) {
    return "Você não tem permissão para realizar esta ação.";
  }
  return raw || "Não foi possível concluir a operação.";
}

function SettingsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["all-profiles-roles"],
    queryFn: async (): Promise<UserRow[]> => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const map = new Map<string, string[]>();
      (r.data ?? []).forEach((row) => {
        const arr = map.get(row.user_id) ?? [];
        arr.push(row.role);
        map.set(row.user_id, arr);
      });
      return (p.data ?? []).map((u) => ({ ...u, roles: map.get(u.id) ?? [] }));
    },
  });

  const setRoleFn = useServerFn(adminSetUserRole);
  const deleteUserFn = useServerFn(adminDeleteUser);

  const setRole = useMutation({
    mutationFn: ({ user_id, role }: { user_id: string; role: "admin" | "collaborator" | "client" }) =>
      setRoleFn({ data: { user_id, role } }),
    onSuccess: () => {
      toast.success("Perfil de acesso atualizado.");
      qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
    },
    onError: (e: any) => toast.error(friendly(e)),
  });

  const removeUser = useMutation({
    mutationFn: (user_id: string) => deleteUserFn({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Usuário removido com sucesso.");
      qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
    },
    onError: (e: any) => toast.error(friendly(e)),
  });

  function roleLabel(role: string) {
    return role === "admin" ? "Administrador" : role === "collaborator" ? "Colaborador" : role === "client" ? "Cliente" : "—";
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Gerenciamento de contas de acesso e perfis de permissão da plataforma."
        action={
          <div className="flex gap-2">
            <VerifyLinksButton />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nova conta de acesso</Button>
              </DialogTrigger>
              {open && (
                <NewUserDialog
                  key={open ? "open" : "closed"}
                  onDone={() => {
                    setOpen(false);
                    qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
                  }}
                />
              )}
            </Dialog>
          </div>
        }
      />

      <Card className="mb-4 p-5">
        <h3 className="font-display text-lg">Módulos administrativos</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Áreas de configuração e catálogos usados pela Digital SC. Não fazem parte da rotina
          diária e ficam concentrados aqui para não poluir o menu operacional.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { to: "/planos", label: "Planos e Checklist", desc: "Catálogo de planos e itens mensais do checklist.", icon: Package },
            { to: "/processos-modelos", label: "Modelos de processos", desc: "Modelos e etapas padrão para novos processos.", icon: GitBranch },
            { to: "/modelos", label: "Modelos de mensagens", desc: "Modelos reutilizáveis para comunicação.", icon: MessagesSquare },
            { to: "/homologacao", label: "Central de Homologação Digital", desc: "Ambiente de homologação e testes.", icon: FlaskConical },
            { to: "/integracoes/omie", label: "Integração OMIE", desc: "Configuração da integração com o OMIE.", icon: Plug },
          ].map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="group flex items-start gap-3 rounded-md border p-3 transition hover:border-primary hover:bg-muted/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <m.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-medium">
                  {m.label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-5">

        <h3 className="font-display text-lg">Contas de acesso</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Apenas administradores podem criar novas contas e alterar perfis de acesso. O cadastro
          público de novas contas está desativado.
        </p>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado até o momento.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-4">Nome</th>
                <th>E-mail</th>
                <th>Perfil de acesso</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className="py-3 pr-4">{u.full_name || "—"}</td>
                  <td>{u.email}</td>
                  <td>
                    <Select
                      value={u.roles[0] ?? ""}
                      onValueChange={(v) => setRole.mutate({ user_id: u.id, role: v as any })}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Sem perfil definido" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="collaborator">Colaborador</SelectItem>
                        <SelectItem value="client">Cliente</SelectItem>
                      </SelectContent>
                    </Select>
                    {u.roles.length === 0 && (
                      <span className="ml-2 text-xs text-warning-foreground">aguardando definição</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => setEditUser(u)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Excluir">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir conta de acesso?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação remove permanentemente a conta de login de {u.full_name || u.email}. Os registros vinculados (cliente, colaborador) não serão excluídos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeUser.mutate(u.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Lembrete: <strong>cargo profissional</strong> (assistente, analista, gerente etc.) é
          configurado em Colaboradores. <strong>Perfil de acesso</strong> (administrador, colaborador,
          cliente) é configurado aqui.
        </p>
      </Card>

      <Card className="mt-6 p-5">
        <h3 className="font-display text-lg">Integrações futuras</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>· Integração com a API do OMIE — estrutura preparada (campos <code>omie_id</code>, <code>origem_cadastro</code>, <code>data_ultima_sincronizacao</code>).</li>
          <li>· Recursos de IA — arquitetura pronta para classificação, resumos e assistente interno.</li>
        </ul>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        {editUser && (
          <EditUserDialog
            user={editUser}
            onDone={() => {
              setEditUser(null);
              qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditUserDialog({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: user.full_name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    new_password: "",
    force_password_change: false,
  });
  const updateFn = useServerFn(adminUpdateUser);
  const mut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          user_id: user.id,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          new_password: form.new_password ? form.new_password : null,
          force_password_change: form.force_password_change,
        },
      }),
    onSuccess: () => {
      toast.success("Conta atualizada com sucesso.");
      onDone();
    },
    onError: (e: any) => toast.error(friendly(e)),
  });

  const disabled =
    !form.full_name.trim() ||
    !form.email.trim() ||
    (form.new_password.length > 0 && form.new_password.length < 8) ||
    mut.isPending;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Editar conta de acesso</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Nome completo *</Label>
          <Input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>E-mail *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Telefone / WhatsApp</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>
        <div className="rounded-md border bg-muted/30 p-3">
          <Label>Nova senha (opcional)</Label>
          <Input
            type="text"
            placeholder="Deixe em branco para manter a atual"
            value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Ao definir uma nova senha, o usuário será obrigado a alterá-la no próximo acesso.
            Mínimo de 8 caracteres.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.force_password_change}
              onChange={(e) => setForm({ ...form, force_password_change: e.target.checked })}
            />
            Exigir troca de senha no próximo acesso (mesmo sem definir nova senha aqui).
          </label>
        </div>

        <AccountLinksEditor userId={user.id} roles={user.roles} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button disabled={disabled} onClick={() => mut.mutate()}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function AccountLinksEditor({ userId, roles }: { userId: string; roles: string[] }) {
  const qc = useQueryClient();
  const role = roles[0];

  // collaborator: load collaborator row + assigned clients
  const { data: collab } = useQuery({
    enabled: role === "collaborator",
    queryKey: ["edit-user-collab", userId],
    queryFn: async () =>
      (await supabase.from("collaborators").select("id, nome").eq("user_id", userId).maybeSingle()).data,
  });
  const { data: client } = useQuery({
    enabled: role === "client",
    queryKey: ["edit-user-client", userId],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social").eq("owner_profile_id", userId).maybeSingle()).data,
  });

  const { data: allClients = [] } = useQuery({
    enabled: role === "collaborator" && !!collab,
    queryKey: ["all-clients-for-link"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social, nome_fantasia, documento, status").order("razao_social")).data ?? [],
  });
  const { data: allCollabs = [] } = useQuery({
    enabled: role === "client" && !!client,
    queryKey: ["all-collabs-for-link"],
    queryFn: async () =>
      (await supabase.from("collaborators").select("id, nome, cargo, departamento, status").order("nome")).data ?? [],
  });

  const { data: assignedClients = [] } = useQuery({
    enabled: !!collab,
    queryKey: ["edit-user-collab-clients", collab?.id],
    queryFn: async () =>
      (await supabase.from("client_collaborators").select("client_id").eq("collaborator_id", collab!.id)).data ?? [],
  });
  const { data: assignedCollabs = [] } = useQuery({
    enabled: !!client,
    queryKey: ["edit-user-client-collabs", client?.id],
    queryFn: async () =>
      (await supabase.from("client_collaborators").select("collaborator_id").eq("client_id", client!.id)).data ?? [],
  });

  const currentClientIds = assignedClients.map((a: any) => a.client_id);
  const currentCollabIds = assignedCollabs.map((a: any) => a.collaborator_id);

  /** Fase E1.2C — toda alteração de vínculo passa pela RPC canônica. */
  async function applyLinkChanges(pairs: Array<{ client_id: string; collaborator_id: string; link: boolean }>) {
    for (const p of pairs) {
      const { error } = await supabase.rpc("admin_set_collaborator_client_link", {
        p_client_id: p.client_id,
        p_collaborator_id: p.collaborator_id,
        p_link: p.link,
      });
      if (error) throw error;
    }
  }

  const updateCollabLinks = useMutation({
    mutationFn: async (next: string[]) => {
      const toAdd = next.filter((id) => !currentClientIds.includes(id));
      const toRemove = currentClientIds.filter((id: string) => !next.includes(id));
      await applyLinkChanges([
        ...toAdd.map((client_id) => ({ client_id, collaborator_id: collab!.id, link: true })),
        ...toRemove.map((client_id: string) => ({ client_id, collaborator_id: collab!.id, link: false })),
      ]);
    },
    onSuccess: () => {
      toast.success("Vínculos atualizados.");
      qc.invalidateQueries({ queryKey: ["edit-user-collab-clients", collab?.id] });
      qc.invalidateQueries({ queryKey: ["collab-clients"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) => toast.error(friendly(e)),
  });

  const updateClientLinks = useMutation({
    mutationFn: async (next: string[]) => {
      const toAdd = next.filter((id) => !currentCollabIds.includes(id));
      const toRemove = currentCollabIds.filter((id: string) => !next.includes(id));
      await applyLinkChanges([
        ...toAdd.map((collaborator_id) => ({ client_id: client!.id, collaborator_id, link: true })),
        ...toRemove.map((collaborator_id: string) => ({ client_id: client!.id, collaborator_id, link: false })),
      ]);
    },
    onSuccess: () => {
      toast.success("Vínculos atualizados.");
      qc.invalidateQueries({ queryKey: ["edit-user-client-collabs", client?.id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) => toast.error(friendly(e)),
  });

  if (role === "admin") return null;

  if (role === "collaborator") {
    if (!collab) {
      return (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Esta conta de colaborador ainda não possui cadastro vinculado em Colaboradores.
        </div>
      );
    }
    return (
      <div className="rounded-md border p-3">
        <Label className="text-xs uppercase text-muted-foreground">EMPRESAS ATRIBUÍDAS A ESTE COLABORADOR</Label>
        <p className="mb-2 text-xs text-muted-foreground">As alterações sincronizam com as abas Clientes e Colaboradores.</p>
        <MultiSelect
          options={allClients.map((c: any) => ({
            value: c.id,
            label: c.razao_social,
            hint: [c.nome_fantasia, c.documento].filter(Boolean).join(" · ") || null,
          }))}
          value={currentClientIds}
          onChange={(next) => updateCollabLinks.mutate(next)}
          placeholder="Buscar por nome, razão social ou CNPJ/CPF…"
          emptyMessage="Nenhuma empresa cadastrada."
          noneSelectedMessage="Nenhuma empresa atribuída."
        />
      </div>
    );
  }

  if (role === "client") {
    return <ClientAccountCompaniesLinker userId={userId} />;
  }

  return null;
}

function ClientAccountCompaniesLinker({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: links = [], isLoading } = useQuery({
    queryKey: ["client-account-companies", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_users")
        .select("id, client_id, papel, ativo, clients:client_id(id, razao_social, nome_fantasia, documento, status)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: allClients = [] } = useQuery({
    queryKey: ["all-clients-for-account-link"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social, nome_fantasia, documento, status").order("razao_social")).data ?? [],
  });

  const [cid, setCid] = useState("");
  const [papel, setPapel] = useState("responsavel");

  const linkedIds = new Set((links as any[]).map((l) => l.client_id));
  const available = (allClients as any[]).filter((c) => !linkedIds.has(c.id));

  const add = useMutation({
    mutationFn: async () => {
      if (!cid) throw new Error("Selecione uma empresa.");
      const { error } = await supabase
        .from("client_users")
        .insert({ client_id: cid, user_id: userId, papel, ativo: true });
      if (error) {
        if (error.code === "23505") throw new Error("Esta empresa já está vinculada a esta conta.");
        throw error;
      }
    },
    onSuccess: () => { toast.success("Empresa vinculada."); setCid(""); qc.invalidateQueries({ queryKey: ["client-account-companies", userId] }); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: any) => toast.error(friendly(e)),
  });
  const toggle = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from("client_users").update({ ativo: !row.ativo }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-account-companies", userId] }),
  });
  const remove = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from("client_users").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vínculo removido."); qc.invalidateQueries({ queryKey: ["client-account-companies", userId] }); qc.invalidateQueries({ queryKey: ["clients"] }); },
  });

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div>
        <Label className="text-xs uppercase text-muted-foreground">Empresas acessíveis por esta conta cliente</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          A conta cliente pode acessar várias empresas. Para criar uma nova empresa, vá em Clientes → Novo cliente e vincule esta conta no formulário.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/30 p-3">
        <div className="flex-1 min-w-[240px]">
          <Label className="text-xs">Empresa existente</Label>
          <Select value={cid} onValueChange={setCid}>
            <SelectTrigger><SelectValue placeholder={available.length === 0 ? "Nenhuma disponível" : "Selecione uma empresa"} /></SelectTrigger>
            <SelectContent>
              {available.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.razao_social}{c.documento ? ` — ${c.documento}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Papel</Label>
          <Select value={papel} onValueChange={setPapel}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="responsavel">Responsável</SelectItem>
              <SelectItem value="financeiro">Financeiro</SelectItem>
              <SelectItem value="socio">Sócio</SelectItem>
              <SelectItem value="operacional">Operacional</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={!cid || add.isPending}>
          {add.isPending ? "Vinculando…" : "Vincular empresa"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (links as any[]).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma empresa vinculada ainda.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(links as any[]).map((l) => (
            <li key={l.id} className="flex items-center justify-between px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{l.clients?.razao_social ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {l.clients?.documento ?? ""}{l.papel ? ` · ${l.papel}` : ""}{!l.ativo ? " · inativo" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggle.mutate(l)} disabled={toggle.isPending}>
                  {l.ativo ? "Desativar" : "Reativar"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">Remover</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover vínculo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A conta deixará de acessar {l.clients?.razao_social ?? "esta empresa"}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(l)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VerifyLinksButton() {
  const [open, setOpen] = useState(false);
  const verifyFn = useServerFn(adminVerifyLinks);
  const { data, isFetching, refetch } = useQuery({
    enabled: open,
    queryKey: ["verify-links"],
    queryFn: () => verifyFn(),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ShieldCheck className="mr-2 h-4 w-4" /> Verificar vínculos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificação de vínculos</DialogTitle>
        </DialogHeader>
        {isFetching || !data ? (
          <p className="text-sm text-muted-foreground">Verificando…</p>
        ) : (
          <VerifyLinksResult report={data} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => refetch()}>Rodar novamente</Button>
          <Button onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerifyLinksResult({ report }: { report: any }) {
  const { totals, issues } = report;
  const allOk =
    issues.clients_without_collaborator.length === 0 &&
    issues.client_accounts_without_client.length === 0 &&
    issues.collab_accounts_without_collaborator.length === 0 &&
    issues.users_without_role.length === 0 &&
    issues.duplicate_links.length === 0 &&
    issues.broken_links.length === 0 &&
    issues.inactive_links.length === 0;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Clientes ativos" value={totals.clients_active} />
        <Stat label="Colaboradores ativos" value={totals.collaborators_active} />
        <Stat label="Vínculos ativos" value={totals.links_active} />
      </div>
      {issues.collaborators_without_client.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Colaboradores ainda sem empresas vinculadas ({issues.collaborators_without_client.length}):</strong>{" "}
          {issues.collaborators_without_client.slice(0, 10).map((c: any) => c.name).join(", ")}
          {issues.collaborators_without_client.length > 10 ? "…" : ""}. Isso é permitido — vincule empresas em Colaboradores ou na aba "Colaboradores responsáveis" da empresa.
        </div>
      )}
      {allOk ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-green-700 dark:text-green-400">
          Todos os vínculos estão funcionando corretamente.
        </p>
      ) : (
        <div className="space-y-2">
          <IssueList title="Clientes sem colaborador" items={issues.clients_without_collaborator.map((c: any) => c.name)} />
          <UnlinkedClientAccounts accounts={issues.client_accounts_without_client} />
          <IssueList
            title="Contas de colaborador sem cadastro vinculado"
            items={issues.collab_accounts_without_collaborator.map((u: any) => u.email)}
          />
          <IssueList
            title="Usuários sem perfil de acesso"
            items={issues.users_without_role.map((u: any) => u.email)}
          />
          <IssueList
            title="Vínculos com cadastro inativo"
            items={issues.inactive_links.map((l: any) => `${l.client} ↔ ${l.collaborator} (${l.reason})`)}
          />
          <IssueList
            title="Vínculos quebrados"
            items={issues.broken_links.map((l: any) => `${l.client_id} ↔ ${l.collaborator_id} (${l.reason})`)}
          />
          <IssueList
            title="Vínculos duplicados"
            items={issues.duplicate_links.map((l: any) => `${l.client_id} ↔ ${l.collaborator_id}`)}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">{title} ({items.length})</div>
      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
        {items.slice(0, 20).map((it, i) => <li key={i}>{it}</li>)}
        {items.length > 20 && <li>… e mais {items.length - 20}</li>}
      </ul>
    </div>
  );
}

function UnlinkedClientAccounts({ accounts }: { accounts: { user_id: string; email: string }[] }) {
  const qc = useQueryClient();
  const linkFn = useServerFn(adminLinkClientAccount);
  const { data: unlinkedClients = [] } = useQuery({
    queryKey: ["link-unlinked-clients"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social").is("owner_profile_id", null).order("razao_social")).data ?? [],
  });
  const [picks, setPicks] = useState<Record<string, string>>({});
  const mut = useMutation({
    mutationFn: (vars: { user_id: string; client_id: string }) =>
      linkFn({ data: vars }),
    onSuccess: () => {
      toast.success("Conta vinculada ao cadastro.");
      qc.invalidateQueries({ queryKey: ["verify-links"] });
      qc.invalidateQueries({ queryKey: ["link-unlinked-clients"] });
    },
    onError: (e: any) => toast.error(friendly(e)),
  });
  if (!accounts.length) return null;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        Contas de cliente sem cadastro vinculado ({accounts.length})
      </div>
      <ul className="mt-2 space-y-2">
        {accounts.map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{a.email}</span>
            <Select value={picks[a.user_id] ?? ""} onValueChange={(v) => setPicks({ ...picks, [a.user_id]: v })}>
              <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue placeholder="Vincular a um cadastro" /></SelectTrigger>
              <SelectContent>
                {(unlinkedClients as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm" className="h-7" disabled={!picks[a.user_id] || mut.isPending}
              onClick={() => mut.mutate({ user_id: a.user_id, client_id: picks[a.user_id]! })}
            >Vincular</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEFAULT_PROVISIONAL_PASSWORD = "Spolaor@123";

function NewUserDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: DEFAULT_PROVISIONAL_PASSWORD,
    phone: "",
    role: "collaborator" as "admin" | "collaborator" | "client",
    link_mode: "create" as "create" | "existing",
    client_id: "",
    collaborator_id: "",
    cargo: "",
    departamento: "",
    data_admissao: "",
    collab_status: "active",
    razao_social: "",
    nome_fantasia: "",
    documento: "",
    tipo: "",
    data_entrada: "",
    client_status: "active",
    observacoes: "",
  });
  const [assignClientIds, setAssignClientIds] = useState<string[]>([]);
  const [assignCollabIds, setAssignCollabIds] = useState<string[]>([]);
  const [receita, setReceita] = useState<ReturnType<typeof mapReceitaToForm> | null>(null);
  const [receitaAt, setReceitaAt] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients-select-unlinked"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social").is("owner_profile_id", null).order("razao_social")).data ?? [],
  });
  const { data: collaborators = [] } = useQuery({
    queryKey: ["unlinked-collabs-select"],
    queryFn: async () =>
      (await supabase.from("collaborators").select("id, nome, user_id").is("user_id", null).order("nome")).data ?? [],
  });
  const { data: allClients = [] } = useQuery({
    queryKey: ["all-clients-assign"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social, nome_fantasia").order("razao_social")).data ?? [],
  });
  const { data: allCollabs = [] } = useQuery({
    queryKey: ["all-collabs-assign"],
    queryFn: async () =>
      (await supabase.from("collaborators").select("id, nome, email").eq("status", "active").order("nome")).data ?? [],
  });


  const createFn = useServerFn(adminCreateUser);
  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          phone: form.phone || null,
          role: form.role,
          link_mode: form.link_mode,
          client_id: form.role === "client" && form.link_mode === "existing" ? form.client_id || null : null,
          collaborator_id: form.role === "collaborator" && form.link_mode === "existing" ? form.collaborator_id || null : null,
          collaborator: form.role === "collaborator" && form.link_mode === "create" ? {
            cargo: form.cargo || null,
            departamento: form.departamento || null,
            data_admissao: form.data_admissao || null,
            status: form.collab_status || "active",
          } : null,
          client: form.role === "client" && form.link_mode === "create" ? {
            razao_social: form.razao_social,
            nome_fantasia: form.nome_fantasia || null,
            documento: form.documento || (receita?.cnpj || null),
            telefone: form.phone || null,
            tipo: form.tipo || null,
            data_entrada: form.data_entrada || null,
            status: form.client_status || "active",
            observacoes: form.observacoes || null,
            ...(receita ? {
              cnpj: receita.cnpj || null,
              situacao_cadastral: receita.situacao_cadastral || null,
              data_abertura: receita.data_abertura || null,
              cnae_principal_codigo: receita.cnae_principal_codigo || null,
              cnae_principal_descricao: receita.cnae_principal_descricao || null,
              cep: receita.cep || null,
              logradouro: receita.logradouro || null,
              numero: receita.numero || null,
              complemento: receita.complemento || null,
              bairro: receita.bairro || null,
              cidade: receita.cidade || null,
              uf: receita.uf || null,
              porte: receita.porte || null,
              natureza_juridica: receita.natureza_juridica || null,
              capital_social: receita.capital_social || null,
              simples_nacional: receita.simples_nacional,
              mei: receita.mei,
              qsa_json: receita.qsa_json,
              dados_receita_json: receita.dados_receita_json,
              ultima_consulta_receita: receitaAt,
            } : {}),
          } : null,
          assign_client_ids: form.role === "collaborator" ? assignClientIds : null,
          assign_collaborator_ids: form.role === "client" ? assignCollabIds : null,
        },
      }),

    onSuccess: (res: any) => {
      toast.success("Conta de acesso criada com sucesso.");
      setCreated({ email: form.email, password: res?.provisional_password ?? form.password });
    },
    onError: (e: any) => toast.error(friendly(e)),
  });

  const disabled =
    !form.full_name.trim() ||
    !form.email.trim() ||
    form.password.length < 8 ||
    (form.role === "client" && form.link_mode === "existing" && !form.client_id) ||
    (form.role === "client" && form.link_mode === "create" && !form.razao_social.trim()) ||
    (form.role === "collaborator" && form.link_mode === "existing" && !form.collaborator_id) ||
    mut.isPending;

  if (created) {
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conta criada</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Compartilhe os dados abaixo com o usuário. Ele será obrigado a definir uma nova senha no primeiro acesso.
          </p>
          <div className="rounded-md border bg-muted/40 p-4">
            <div><span className="text-muted-foreground">E-mail:</span> <strong>{created.email}</strong></div>
            <div className="mt-1"><span className="text-muted-foreground">Senha provisória:</span> <strong className="font-mono">{created.password}</strong></div>
          </div>
          <p className="text-xs text-muted-foreground">
            Após o primeiro acesso, esta senha provisória deixa de funcionar.
          </p>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(`E-mail: ${created.email}\nSenha provisória: ${created.password}`).catch(() => {});
              toast.success("Dados copiados para a área de transferência.");
            }}
            variant="outline"
          >
            Copiar dados
          </Button>
          <Button onClick={onDone}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nova conta de acesso</DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        <div className="rounded-md border bg-muted/30 p-3">
          <Label className="text-xs uppercase text-muted-foreground">Perfil de acesso *</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any, link_mode: "create" })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador — acesso total à plataforma</SelectItem>
              <SelectItem value="collaborator">Colaborador — equipe interna</SelectItem>
              <SelectItem value="client">Cliente — acesso à própria área</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            <strong>Perfil de acesso</strong> define a permissão na plataforma. <strong>Cargo profissional</strong> (analista, gerente etc.) é dado do colaborador.
          </p>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Dados de acesso</h4>
          <div>
            <Label>Nome completo *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>E-mail *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Telefone / WhatsApp</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Senha provisória *</Label>
            <Input type="text" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">
              Padrão sugerido: <code>DigitalSC@123</code>. O usuário será obrigado a alterar a senha no primeiro acesso.
            </p>
          </div>
        </section>

        {form.role === "collaborator" && (
          <section className="space-y-3 rounded-md border p-4">
            <h4 className="text-sm font-semibold">Cadastro de colaborador</h4>
            <div>
              <Label className="text-xs">Modo</Label>
              <Select value={form.link_mode} onValueChange={(v) => setForm({ ...form, link_mode: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Criar novo colaborador automaticamente</SelectItem>
                  <SelectItem value="existing">Vincular a colaborador existente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.link_mode === "existing" ? (
              <div>
                <Label>Colaborador existente *</Label>
                <Select value={form.collaborator_id} onValueChange={(v) => setForm({ ...form, collaborator_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                  <SelectContent>
                    {collaborators.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum colaborador sem acesso disponível.</div>
                    )}
                    {collaborators.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cargo profissional</Label>
                  <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Analista, Gerente…" />
                </div>
                <div>
                  <Label>Departamento</Label>
                  <Input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} />
                </div>
                <div>
                  <Label>Data de admissão</Label>
                  <Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.collab_status} onValueChange={(v) => setForm({ ...form, collab_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="border-t pt-3">
              <Label className="text-xs uppercase text-muted-foreground">EMPRESAS ATRIBUÍDAS A ESTE COLABORADOR</Label>
              <p className="mb-2 text-xs text-muted-foreground">Você poderá alterar esses vínculos depois.</p>
              <MultiSelect
                options={allClients.map((c: any) => ({
                  value: c.id,
                  label: c.razao_social,
                  hint: c.nome_fantasia,
                }))}
                value={assignClientIds}
                onChange={setAssignClientIds}
                placeholder="Buscar empresa…"
                emptyMessage="Nenhuma empresa cadastrada."
                noneSelectedMessage="Nenhuma empresa selecionada."
              />
            </div>
          </section>
        )}


        {form.role === "client" && (
          <section className="space-y-3 rounded-md border p-4">
            <h4 className="text-sm font-semibold">Empresa vinculada à conta cliente</h4>
            <p className="text-xs text-muted-foreground">
              Vincule uma ou mais empresas a esta conta cliente. O usuário poderá acessar apenas as empresas vinculadas à sua conta.
            </p>
            <div>
              <Label className="text-xs">Modo</Label>
              <Select value={form.link_mode} onValueChange={(v) => setForm({ ...form, link_mode: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Criar nova empresa automaticamente</SelectItem>
                  <SelectItem value="existing">Vincular a empresa existente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.link_mode === "existing" ? (
              <div>
                <Label>Empresa existente *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {clients.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma empresa sem acesso disponível.</div>
                    )}
                    {clients.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3">
                <CnpjLookup
                  value={form.documento}
                  onChange={(v) => setForm({ ...form, documento: v })}
                  onResult={(r: ReceitaData) => {
                    const m = mapReceitaToForm(r);
                    setReceita(m);
                    setReceitaAt(new Date().toISOString());
                    setForm({
                      ...form,
                      documento: m.cnpj || form.documento,
                      razao_social: m.razao_social || form.razao_social,
                      nome_fantasia: m.nome_fantasia || form.nome_fantasia,
                    });
                  }}
                />
                {receita?.situacao_cadastral &&
                  receita.situacao_cadastral.toUpperCase() !== "ATIVA" && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Atenção: este CNPJ está com situação cadastral diferente de ATIVA ({receita.situacao_cadastral}).
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Razão social / Nome *</Label>
                    <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
                  </div>
                <div>
                  <Label>Nome fantasia</Label>
                  <Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} />
                </div>
                <div>
                  <Label>CNPJ ou CPF</Label>
                  <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
                </div>
                <div>
                  <Label>Tipo de empresa</Label>
                  <Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="PJ, PF, MEI…" />
                </div>
                <div>
                  <Label>Data de entrada</Label>
                  <Input type="date" value={form.data_entrada} onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Status</Label>
                  <Select value={form.client_status} onValueChange={(v) => setForm({ ...form, client_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Observações internas</Label>
                  <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
                </div>
                </div>
              </div>
            )}
            <div className="border-t pt-3">
              <Label className="text-xs uppercase text-muted-foreground">COLABORADORES ATRIBUÍDOS A ESTA EMPRESA</Label>
              <p className="mb-2 text-xs text-muted-foreground">Você poderá alterar esses vínculos depois.</p>
              <MultiSelect
                options={allCollabs.map((c: any) => ({
                  value: c.id,
                  label: c.nome,
                  hint: c.email,
                }))}
                value={assignCollabIds}
                onChange={setAssignCollabIds}
                placeholder="Buscar colaborador…"
                emptyMessage="Nenhum colaborador ativo cadastrado."
                noneSelectedMessage="Nenhum colaborador selecionado."
              />
            </div>
          </section>
        )}


        {form.role === "admin" && (
          <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Administradores aparecem apenas em Configurações &gt; Contas de acesso. Não é criado registro em Clientes ou Colaboradores.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button disabled={disabled} onClick={() => mut.mutate()}>
          {mut.isPending ? "Criando…" : "Criar conta"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

