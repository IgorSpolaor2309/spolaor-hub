import { createFileRoute, Link } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
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
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { useMemo, useState } from "react";
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
  const isAdmin = role === "admin";
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("active");
  const [fTipo, setFTipo] = useState<string>("all");
  const [fRegime, setFRegime] = useState<string>("all");
  const [fUf, setFUf] = useState<string>("all");
  const [fResp, setFResp] = useState<string>("all");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);


  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_fiscal_data(regime_tributario, uf, municipio), client_collaborators(collaborator_id, collaborators(id, nome))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ["clients-collabs-options"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("collaborators").select("id, nome").eq("status", "active").order("nome")).data ?? [],
  });

  const regimeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients as any[]) {
      const r = c.client_fiscal_data?.regime_tributario;
      if (r) s.add(r);
    }
    return Array.from(s).sort();
  }, [clients]);
  const ufOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients as any[]) {
      const u = c.client_fiscal_data?.uf;
      if (u) s.add(u);
    }
    return Array.from(s).sort();
  }, [clients]);

  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = (clients as any[]).filter((c) => {
    if (q && ![c.razao_social, c.nome_fantasia, c.documento, c.email].join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    if (fStatus !== "all" && c.status !== fStatus) return false;
    if (fTipo !== "all" && c.tipo !== fTipo) return false;
    if (fRegime !== "all" && (c.client_fiscal_data?.regime_tributario ?? "") !== fRegime) return false;
    if (fUf !== "all" && (c.client_fiscal_data?.uf ?? "") !== fUf) return false;
    if (fResp !== "all") {
      const ids = (c.client_collaborators ?? []).map((cc: any) => cc.collaborator_id);
      if (!ids.includes(fResp)) return false;
    }
    if (!inRange(c.data_entrada ?? c.created_at, range)) return false;
    return true;
  });
  const clearFilters = () => {
    setQ(""); setFStatus("active"); setFTipo("all"); setFRegime("all"); setFUf("all"); setFResp("all"); setDateF(EMPTY_DATE_FILTER);
  };

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

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Razão social, CNPJ, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {regimeOptions.length > 0 && (
            <div>
              <Label className="text-xs">Regime tributário</Label>
              <Select value={fRegime} onValueChange={setFRegime}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {regimeOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {ufOptions.length > 0 && (
            <div>
              <Label className="text-xs">UF</Label>
              <Select value={fUf} onValueChange={setFUf}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ufOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {isAdmin && (collaborators as any[]).length > 0 && (
            <div>
              <Label className="text-xs">Responsável</Label>
              <Select value={fResp} onValueChange={setFResp}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(collaborators as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DateRangeFilter value={dateF} onChange={setDateF} label="Data de entrada" />
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
      </Card>

      <Card className="p-4">


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
                    <td className="py-3 pr-4">{formatBR(c.data_entrada)}</td>
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

function InactivateClientButton({ client }: { client: any }) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(adminSetClientStatus);
  const isInactive = client.status === "inactive";
  const mut = useMutation({
    mutationFn: () =>
      setStatusFn({
        data: { client_id: client.id, status: isInactive ? "active" : "inactive" },
      }),
    onSuccess: () => {
      toast.success(isInactive ? "Cliente reativado." : "Cliente removido com sucesso.");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) =>
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para realizar esta ação."
          : (e?.message ?? "Não foi possível atualizar o cliente."),
      ),
  });

  if (isInactive) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Reativar cliente"
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
        <Button variant="ghost" size="icon" aria-label="Remover cliente">
          <PowerOff className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover este cliente? Ele será marcado como inativo
            e deixará de aparecer para os colaboradores. O histórico, documentos,
            pendências e vínculos serão preservados e poderão ser restaurados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()}>Remover cliente</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
