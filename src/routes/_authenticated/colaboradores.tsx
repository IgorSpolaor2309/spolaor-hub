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
import { Plus, UserCog, Pencil } from "lucide-react";
import { toast } from "sonner";

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
  const [editing, setEditing] = useState<CollabRow | null>(null);
  const [open, setOpen] = useState(false);

  const { data: list = [] } = useQuery({
    queryKey: ["collaborators"],
    queryFn: async () => {
      const { data } = await supabase
        .from("collaborators")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as CollabRow[];
    },
  });

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
        {list.length === 0 ? (
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
                <th>Departamento</th>
                <th>Acesso ao sistema</th>
                <th>Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">{c.nome}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.cargo ?? "—"}</td>
                  <td>{c.departamento ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">
                    {c.user_id ? "Vinculado" : "Sem acesso"}
                  </td>
                  <td><StatusBadge value={c.status} /></td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
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
      </div>
      <DialogFooter>
        <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
