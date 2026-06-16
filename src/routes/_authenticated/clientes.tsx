import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { useState } from "react";
import { Plus, Search, Users, Pencil, PowerOff, Power } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { adminSetClientStatus } from "@/lib/admin-users.functions";

import { useCurrentUser } from "@/hooks/use-current-user";
import { CLIENT_TYPES, labelOf } from "@/lib/sc-types";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientsPage,
});

function ClientsPage() {
  const { role } = useCurrentUser();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);


  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = clients.filter((c) =>
    [c.razao_social, c.nome_fantasia, c.documento, c.email].join(" ").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title={role === "admin" ? "Clientes" : "Meus clientes"}
        description={role === "admin" ? "Cadastro e gestão de todos os clientes." : "Clientes vinculados ao seu atendimento."}
        action={
          role === "admin" && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Novo cliente</Button>
              </DialogTrigger>
              <NewClientDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
            </Dialog>
          )
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por razão social, CNPJ, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum cliente encontrado"
            description={role === "admin" ? "Crie o primeiro cliente para começar." : "Nenhum cliente vinculado a você."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Entrada</th>
                  <th className="py-2 pr-4">Status</th>
                  {role === "admin" && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/40">
                    <td className="py-3 pr-4">
                      <Link to="/clientes/$id" params={{ id: c.id }} className="font-medium text-primary hover:underline">
                        {c.razao_social}
                      </Link>
                      {c.nome_fantasia && <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>}
                    </td>
                    <td className="py-3 pr-4">{labelOf(CLIENT_TYPES, c.tipo)}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{c.documento ?? "—"}</td>
                    <td className="py-3 pr-4">{c.data_entrada ? new Date(c.data_entrada).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="py-3 pr-4"><StatusBadge value={c.status} /></td>
                    {role === "admin" && (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <InactivateClientButton client={c} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <EditClientDialog
            client={editing}
            onDone={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["clients"] });
            }}
          />
        </Dialog>
      )}

    </div>
  );
}

function NewClientDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    razao_social: "", nome_fantasia: "", documento: "", email: "", telefone: "",
    tipo: "comercio", observacoes: "",
  });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("clients").insert({ ...form, origem_cadastro: "manual" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente criado"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Razão social *</Label>
          <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} required />
        </div>
        <div className="space-y-1.5"><Label>Nome fantasia</Label><Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>CNPJ / CPF</Label><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observações internas</Label>
          <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={!form.razao_social || mut.isPending}>
          {mut.isPending ? "Salvando…" : "Criar cliente"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditClientDialog({ client, onDone }: { client: any; onDone: () => void }) {
  const [form, setForm] = useState({
    razao_social: client.razao_social ?? "",
    nome_fantasia: client.nome_fantasia ?? "",
    documento: client.documento ?? "",
    email: client.email ?? "",
    telefone: client.telefone ?? "",
    tipo: client.tipo ?? "comercio",
    data_entrada: client.data_entrada ?? "",
    status: client.status ?? "active",
    observacoes: client.observacoes ?? "",
  });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("clients")
        .update({
          razao_social: form.razao_social.trim(),
          nome_fantasia: form.nome_fantasia || null,
          documento: form.documento || null,
          email: form.email || null,
          telefone: form.telefone || null,
          tipo: form.tipo || null,
          data_entrada: form.data_entrada || null,
          status: form.status || "active",
          observacoes: form.observacoes || null,
        })
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente atualizado com sucesso."); onDone(); },
    onError: (e: any) => toast.error(
      /row-level security|permission/i.test(e?.message ?? "")
        ? "Você não tem permissão para realizar esta ação."
        : (e?.message ?? "Não foi possível atualizar o cliente."),
    ),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Razão social / Nome *</Label>
          <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
        </div>
        <div className="space-y-1.5"><Label>Nome fantasia</Label><Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>CNPJ / CPF</Label><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>E-mail principal</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Tipo de cliente</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Data de entrada</Label>
          <Input type="date" value={form.data_entrada ?? ""} onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observações internas</Label>
          <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={!form.razao_social.trim() || mut.isPending}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
