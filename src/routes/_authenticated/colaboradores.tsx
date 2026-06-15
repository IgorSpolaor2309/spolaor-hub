import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  component: CollaboratorsPage,
});

function CollaboratorsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: list = [] } = useQuery({
    queryKey: ["collaborators"],
    queryFn: async () => (await supabase.from("collaborators").select("*, profiles(full_name, email, phone)").order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <div>
      <PageHeader
        title="Colaboradores"
        description="Equipe interna da Spolaor Company."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo colaborador</Button></DialogTrigger>
            <NewCollaboratorDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["collaborators"] }); }} />
          </Dialog>
        }
      />
      <Card className="p-4">
        {list.length === 0 ? (
          <EmptyState
            icon={<UserCog className="h-6 w-6" />}
            title="Nenhum colaborador cadastrado"
            description="Cadastre o primeiro membro da equipe."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b"><th className="py-2 pr-4">Nome</th><th>E-mail</th><th>Cargo</th><th>Departamento</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((c: any) => (
                <tr key={c.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">{c.profiles?.full_name ?? "—"}</td>
                  <td>{c.profiles?.email}</td>
                  <td>{c.cargo ?? "—"}</td>
                  <td>{c.departamento ?? "—"}</td>
                  <td><StatusBadge value={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Para que o colaborador acesse o sistema, peça a ele para criar conta em <code>/auth</code> com o mesmo e-mail informado aqui — então vincule o perfil em "Configurações".
      </p>
    </div>
  );
}

function NewCollaboratorDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ profile_id: "", cargo: "", departamento: "", data_admissao: "" });
  const { data: profiles = [] } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email").order("created_at", { ascending: false })).data ?? [],
  });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("collaborators").insert({ ...form, data_admissao: form.data_admissao || null });
      if (error) throw error;
      // assign collaborator role
      await supabase.from("user_roles").insert({ user_id: form.profile_id, role: "collaborator" }).then(() => {});
    },
    onSuccess: () => { toast.success("Colaborador criado"); onDone(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo colaborador</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div><Label>Perfil de usuário *</Label>
          <Select value={form.profile_id} onValueChange={(v) => setForm({ ...form, profile_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione um perfil já cadastrado" /></SelectTrigger>
            <SelectContent>{profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">O perfil precisa existir (criado na tela de cadastro).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Cargo</Label><Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
          <div><Label>Departamento</Label><Input value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} /></div>
        </div>
        <div><Label>Data de admissão</Label><Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} /></div>
      </div>
      <DialogFooter><Button disabled={!form.profile_id || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Salvando…" : "Criar"}</Button></DialogFooter>
    </DialogContent>
  );
}
