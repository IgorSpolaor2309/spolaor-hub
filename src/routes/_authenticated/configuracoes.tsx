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
import { Plus, Trash2 } from "lucide-react";
import {
  adminCreateUser, adminSetUserRole, adminDeleteUser,
} from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: SettingsPage,
});

type UserRow = { id: string; full_name: string | null; email: string | null; roles: string[] };

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

  const { data: users = [] } = useQuery({
    queryKey: ["all-profiles-roles"],
    queryFn: async (): Promise<UserRow[]> => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Nova conta de acesso</Button>
            </DialogTrigger>
            <NewUserDialog
              onDone={() => {
                setOpen(false);
                qc.invalidateQueries({ queryKey: ["all-profiles-roles"] });
              }}
            />
          </Dialog>
        }
      />

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
    client_id: "",
    collaborator_id: "",
  });
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["all-clients-select"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social").order("razao_social")).data ?? [],
  });
  const { data: collaborators = [] } = useQuery({
    queryKey: ["unlinked-collabs-select"],
    queryFn: async () =>
      (await supabase.from("collaborators").select("id, nome, user_id").is("user_id", null).order("nome")).data ?? [],
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
          client_id: form.role === "client" ? form.client_id || null : null,
          collaborator_id: form.role === "collaborator" ? form.collaborator_id || null : null,
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
    (form.role === "client" && !form.client_id) ||
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
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Nova conta de acesso</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
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
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Senha provisória *</Label>
          <Input
            type="text"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Padrão sugerido: <code>Spolaor@123</code>. O usuário será obrigado a alterar a senha no primeiro acesso.
          </p>
        </div>
        <div>
          <Label>Perfil de acesso *</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Administrador</SelectItem>
              <SelectItem value="collaborator">Colaborador</SelectItem>
              <SelectItem value="client">Cliente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.role === "client" && (
          <div>
            <Label>Cliente vinculado *</Label>
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Este usuário poderá visualizar apenas a área do cliente vinculado.
            </p>
          </div>
        )}

        {form.role === "collaborator" && (
          <div>
            <Label>Colaborador vinculado (opcional)</Label>
            <Select
              value={form.collaborator_id || "none"}
              onValueChange={(v) => setForm({ ...form, collaborator_id: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="Sem colaborador vinculado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem colaborador vinculado</SelectItem>
                {collaborators.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Vincule a conta a um colaborador já cadastrado para que ele veja os clientes designados.
            </p>
          </div>
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

