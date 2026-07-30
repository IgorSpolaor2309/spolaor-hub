import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { useState } from "react";
import { Plus, UserCog, Pencil, PowerOff, Power } from "lucide-react";
import { toast } from "sonner";
import { MultiSelect } from "@/components/sc/MultiSelect";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { adminSetCollaboratorStatus } from "@/lib/admin-users.functions";
import { getAdminCollaboratorsPage } from "@/lib/access-diagnostics.functions";
import { DemoBadge } from "@/components/sc/DemoBadge";
import { DemoFilter, matchesDemoFilter, type DemoFilterValue } from "@/components/sc/DemoFilter";


export const Route = createFileRoute("/_authenticated/colaboradores")({
  component: CollaboratorsPage,
});

type CollabRow = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  departamento: string | null;
  data_admissao: string | null;
  status: string;
  observacoes: string | null;
  user_id: string | null;
  is_demo?: boolean | null;
};

const emptyForm: Omit<CollabRow, "id"> = {
  nome: "",
  email: "",
  telefone: "",
  cargo: "",
  departamento: "",
  data_admissao: "",
  status: "active",
  observacoes: "",
  user_id: null,
};

function CollaboratorsPage() {
  const qc = useQueryClient();
  const getAdminCollaborators = useServerFn(getAdminCollaboratorsPage);
  const [editing, setEditing] = useState<CollabRow | null>(null);
  const [open, setOpen] = useState(false);
  const [demoFilter, setDemoFilter] = useState<DemoFilterValue>("real");

  const { data: list = [], error: listError, isLoading } = useQuery({
    queryKey: ["collaborators"],
    queryFn: async () => {
      return (await getAdminCollaborators({})) as CollabRow[];
    },
  });
  const filteredList = list.filter((c) => matchesDemoFilter(c, demoFilter));

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(row: CollabRow) {
    setEditing(row);
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        description="Equipe interna da Spolaor Company. O cadastro do colaborador não exige conta de acesso — contas de login são criadas em Configurações."
        action={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Novo colaborador
          </Button>
        }
      />

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">{filteredList.length} de {list.length} colaborador(es)</div>
          <DemoFilter value={demoFilter} onChange={setDemoFilter} />
        </div>
        {listError ? (
          <EmptyState
            icon={<UserCog className="h-6 w-6" />}
            title="Não foi possível carregar colaboradores"
            description={(listError as Error).message || "Verifique as permissões da consulta."}
          />
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : filteredList.length === 0 ? (
          <EmptyState
            icon={<UserCog className="h-6 w-6" />}
            title="Nenhum colaborador cadastrado"
            description="Cadastre o primeiro membro da equipe para começar."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-4">Nome</th>
                <th>E-mail</th>
                <th>Cargo</th>
                <th>&nbsp;DEPARTAMENTO&nbsp;</th>
                <th>Acesso ao sistema</th>
                <th>Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">
                    <span className="inline-flex items-center gap-2">{c.nome}{c.is_demo ? <DemoBadge compact /> : null}</span>
                  </td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.cargo ?? "—"}</td>
                  <td>{c.departamento ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">
                    {c.user_id ? "Vinculado" : "Sem acesso"}
                  </td>
                  <td><StatusBadge value={c.status} /></td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <InactivateCollaboratorButton collaborator={c} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className="hidden" />
        <CollaboratorDialog
          key={editing?.id ?? "new"}
          editing={editing}
          onDone={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["collaborators"] });
          }}
        />
      </Dialog>

      <p className="mt-3 text-xs text-muted-foreground">
        Cargo profissional (assistente, analista, gerente etc.) é diferente do perfil de acesso
        (administrador, colaborador, cliente). O perfil de acesso é definido pelo administrador em
        Configurações.
      </p>
    </div>
  );
}

function CollaboratorDialog({
  editing,
  onDone,
}: {
  editing: CollabRow | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<Omit<CollabRow, "id">>(
    editing
      ? {
          nome: editing.nome ?? "",
          email: editing.email ?? "",
          telefone: editing.telefone ?? "",
          cargo: editing.cargo ?? "",
          departamento: editing.departamento ?? "",
          data_admissao: editing.data_admissao ?? "",
          status: editing.status ?? "active",
          observacoes: editing.observacoes ?? "",
          user_id: editing.user_id ?? null,
        }
      : { ...emptyForm },
  );

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        email: form.email?.trim() || null,
        telefone: form.telefone?.trim() || null,
        cargo: form.cargo?.trim() || null,
        departamento: form.departamento?.trim() || null,
        data_admissao: form.data_admissao || null,
        status: form.status || "active",
        observacoes: form.observacoes?.trim() || null,
      };
      if (!payload.nome) throw new Error("Informe o nome do colaborador.");

      if (editing) {
        const { error } = await supabase.from("collaborators").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("collaborators").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Colaborador atualizado com sucesso." : "Colaborador cadastrado com sucesso.");
      onDone();
    },
    onError: (e: any) => {
      const raw = e?.message ?? "";
      toast.error(
        /row-level security|permission/i.test(raw)
          ? "Você não tem permissão para realizar esta ação."
          : raw || "Não foi possível salvar o colaborador.",
      );
    },
  });

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Editar colaborador" : "Novo colaborador"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Nome completo *</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.telefone ?? ""}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Cargo profissional</Label>
            <Input
              placeholder="Ex.: Analista, Coordenador, Gerente"
              value={form.cargo ?? ""}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            />
          </div>
          <div>
            <Label>Departamento</Label>
            <Input
              value={form.departamento ?? ""}
              onChange={(e) => setForm({ ...form, departamento: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Data de admissão</Label>
            <Input
              type="date"
              value={form.data_admissao ?? ""}
              onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea
            value={form.observacoes ?? ""}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        {editing?.user_id && (
          <p className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
            Este colaborador já possui conta de acesso vinculada. O perfil de acesso é gerenciado em Configurações.
          </p>
        )}
        {editing && <CollaboratorClientsSection collaboratorId={editing.id} />}
      </div>

      <DialogFooter>
        <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CollaboratorClientsSection({ collaboratorId }: { collaboratorId: string }) {
  const qc = useQueryClient();
  const { data: assigned = [] } = useQuery({
    queryKey: ["collab-clients", collaboratorId],
    queryFn: async () =>
      (await supabase
        .from("client_collaborators")
        .select("client_id, is_primary, clients(razao_social, nome_fantasia)")
        .eq("collaborator_id", collaboratorId)).data ?? [],
  });
  const { data: allClients = [] } = useQuery({
    queryKey: ["all-clients-for-collab"],
    queryFn: async () =>
      (await supabase.from("clients").select("id, razao_social, nome_fantasia").order("razao_social")).data ?? [],
  });

  const currentIds = assigned.map((a: any) => a.client_id);
  const primaryOf = new Map(assigned.map((a: any) => [a.client_id, !!a.is_primary]));

  /**
   * Fase E1.2C — cada alteração passa pela RPC transacional; a remoção de um
   * responsável principal é recusada pelo servidor quando deixaria a empresa
   * ativa sem responsável.
   */
  const setAssignments = useMutation({
    mutationFn: async (next: string[]) => {
      const toAdd = next.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id: string) => !next.includes(id));
      for (const client_id of [...toAdd.map((id) => ({ id, link: true })), ...toRemove.map((id: string) => ({ id, link: false }))]) {
        const { error } = await supabase.rpc("admin_set_collaborator_client_link", {
          p_client_id: client_id.id,
          p_collaborator_id: collaboratorId,
          p_link: client_id.link,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Empresas atribuídas atualizadas.");
      qc.invalidateQueries({ queryKey: ["collab-clients", collaboratorId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: unknown) => toast.error(linkErrorMessage(e)),
  });

  return (
    <div className="rounded-md border p-3">
      <Label className="text-xs uppercase text-muted-foreground">EMPRESAS ATRIBUÍDAS A ESTE COLABORADOR</Label>
      <p className="mb-2 text-xs text-muted-foreground">
        Adicione ou remova empresas. O responsável principal é definido na ficha da empresa.
      </p>
      <MultiSelect
        options={allClients.map((c: any) => ({
          value: c.id,
          label: c.razao_social,
          hint: c.nome_fantasia,
        }))}
        value={currentIds}
        onChange={(next) => setAssignments.mutate(next)}
        placeholder="Buscar cliente…"
        emptyMessage="Nenhum cliente cadastrado."
        noneSelectedMessage="Nenhuma empresa selecionada."
      />
      {assigned.some((a: any) => a.is_primary) && (
        <ul className="mt-2 space-y-1">
          {assigned.filter((a: any) => primaryOf.get(a.client_id)).map((a: any) => (
            <li key={a.client_id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Principal</Badge>
              <span className="truncate">{a.clients?.razao_social ?? a.client_id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InactivateCollaboratorButton({ collaborator }: { collaborator: CollabRow }) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(adminSetCollaboratorStatus);
  const isInactive = collaborator.status === "inactive";
  const mut = useMutation({
    mutationFn: () =>
      setStatusFn({
        data: {
          collaborator_id: collaborator.id,
          status: isInactive ? "active" : "inactive",
          remove_links: !isInactive,
        },
      }),
    onSuccess: () => {
      toast.success(isInactive ? "Colaborador reativado." : "Colaborador removido com sucesso.");
      qc.invalidateQueries({ queryKey: ["collaborators"] });
    },
    onError: (e: any) =>
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para realizar esta ação."
          : (e?.message ?? "Não foi possível atualizar o colaborador."),
      ),
  });

  if (isInactive) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Reativar colaborador"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
      >
        <Power className="h-4 w-4 text-green-600" />
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Remover colaborador">
          <PowerOff className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover colaborador</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover este colaborador? Ele será marcado como inativo
            e os vínculos com clientes serão removidos. A conta de acesso vinculada não será
            excluída automaticamente — gerencie-a em Configurações se desejar desativá-la.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()}>Remover colaborador</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
