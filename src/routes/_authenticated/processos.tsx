import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/sc/EmptyState";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import { toast } from "sonner";
import { Workflow, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/processos")({
  component: ProcessesPage,
});

const STATUSES = [
  { value: "nao_iniciado", label: "Não iniciado", cls: "bg-zinc-200 text-zinc-700" },
  { value: "em_andamento", label: "Em andamento", cls: "bg-blue-100 text-blue-800" },
  { value: "aguardando_cliente", label: "Aguardando cliente", cls: "bg-amber-100 text-amber-800" },
  { value: "aguardando_orgao", label: "Aguardando órgão", cls: "bg-orange-100 text-orange-800" },
  { value: "concluido", label: "Concluído", cls: "bg-emerald-100 text-emerald-800" },
  { value: "cancelado", label: "Cancelado", cls: "bg-red-100 text-red-800" },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));
const PRIORIDADES = [
  { value: "baixa", label: "Baixa", cls: "bg-zinc-100 text-zinc-700" },
  { value: "media", label: "Média", cls: "bg-blue-100 text-blue-700" },
  { value: "alta", label: "Alta", cls: "bg-amber-100 text-amber-700" },
  { value: "urgente", label: "Urgente", cls: "bg-red-100 text-red-700" },
];
const PRIO_MAP = Object.fromEntries(PRIORIDADES.map((p) => [p.value, p]));

function ProcessesPage() {
  const { role, loading } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fClient, setFClient] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fPrio, setFPrio] = useState<string>("all");
  const [fResp, setFResp] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("prazo");

  const ready = !loading && (role === "admin" || role === "collaborator");

  const listQ = useQuery({
    queryKey: ["company-processes"],
    enabled: ready,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_processes")
        .select("*, clients(razao_social, nome_fantasia, documento), process_types(nome, cor, categoria), steps:company_process_steps(id, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.responsavel_id).filter(Boolean)));
      let profMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids as string[]);
        (profs ?? []).forEach((p: any) => { profMap[p.id] = p.full_name; });
      }
      return rows.map((r: any) => ({ ...r, responsavel: r.responsavel_id ? { full_name: profMap[r.responsavel_id] ?? null } : null }));
    },
  });

  const typesQ = useQuery({
    queryKey: ["process-types-active"],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("process_types")
        .select("id, nome, categoria, cor, status").eq("status", "ativo").order("ordem").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientsQ = useQuery({
    queryKey: ["processes-clients"],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .is("deleted_at", null).order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const collabsQ = useQuery({
    queryKey: ["processes-collabs"],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators")
        .select("id, user_id, nome_completo").eq("status", "active").order("nome_completo");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.user_id);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = (listQ.data ?? []).filter((r: any) => {
      if (fClient !== "all" && r.client_id !== fClient) return false;
      if (fType !== "all" && r.process_type_id !== fType) return false;
      if (fStatus !== "all" && r.status !== fStatus) return false;
      if (fPrio !== "all" && r.prioridade !== fPrio) return false;
      if (fResp !== "all" && r.responsavel_id !== fResp) return false;
      if (q) {
        const hay = `${r.clients?.razao_social ?? ""} ${r.clients?.nome_fantasia ?? ""} ${r.process_types?.nome ?? ""} ${r.observacoes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    arr.sort((a: any, b: any) => {
      switch (sortBy) {
        case "empresa": return (a.clients?.razao_social ?? "").localeCompare(b.clients?.razao_social ?? "");
        case "responsavel": return (a.responsavel?.full_name ?? "~").localeCompare(b.responsavel?.full_name ?? "~");
        case "status": return (a.status ?? "").localeCompare(b.status ?? "");
        case "abertura": return (b.data_abertura ?? "").localeCompare(a.data_abertura ?? "");
        case "prazo":
        default: {
          const av = a.prazo_final ?? "9999-99-99";
          const bv = b.prazo_final ?? "9999-99-99";
          return av.localeCompare(bv);
        }
      }
    });
    return arr;
  }, [listQ.data, search, fClient, fType, fStatus, fPrio, fResp, sortBy]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores." />;
  }

  return (
    <div>
      <PageHeader
        title="Processos"
        description="Acompanhamento de serviços extraordinários das empresas."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo processo</Button>
            </DialogTrigger>
            {open && <NewProcessDialog
              clients={clientsQ.data ?? []}
              types={typesQ.data ?? []}
              collabs={collabsQ.data ?? []}
              onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["company-processes"] }); }}
            />}
          </Dialog>
        }
      />

      <Card className="mb-3 p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={fClient} onValueChange={setFClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(clientsQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{clientLabel(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(typesQ.data ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={fPrio} onValueChange={setFPrio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {PRIORIDADES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Responsável</Label>
            <Select value={fResp} onValueChange={setFResp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(collabsQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ordenar por</Label>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prazo">Prazo</SelectItem>
                <SelectItem value="empresa">Empresa</SelectItem>
                <SelectItem value="responsavel">Responsável</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="abertura">Data de abertura</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-2">
        {listQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : filtered.length === 0 ? <EmptyState icon={<Workflow className="h-6 w-6" />} title="Nenhum processo" description="Crie o primeiro processo clicando em 'Novo processo'." />
          : (
            <ul className="divide-y">
              {filtered.map((p: any) => {
                const total = p.steps?.length ?? 0;
                const done = (p.steps ?? []).filter((s: any) => s.status === "concluida").length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const st = STATUS_MAP[p.status];
                const pr = PRIO_MAP[p.prioridade];
                return (
                  <li key={p.id}>
                    <Link to="/processos/$id" params={{ id: p.id }} className="block p-3 hover:bg-muted/40">
                      <div className="flex flex-wrap items-center gap-2">
                        {p.process_types?.cor && <span className="h-3 w-3 rounded-full border" style={{ background: p.process_types.cor }} />}
                        <span className="font-medium">{clientLabel(p.clients)}</span>
                        <Badge variant="outline">{p.process_types?.nome}</Badge>
                        {st && <Badge className={st.cls}>{st.label}</Badge>}
                        {pr && <Badge className={pr.cls}>{pr.label}</Badge>}
                        {p.responsavel?.full_name && <span className="text-xs text-muted-foreground">· {p.responsavel.full_name}</span>}
                        {p.prazo_final && <span className="text-xs text-muted-foreground">· prazo {new Date(p.prazo_final).toLocaleDateString("pt-BR")}</span>}
                        <span className="ml-auto text-xs text-muted-foreground">{done}/{total} etapas</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={pct} className="h-1.5" />
                        <span className="w-10 text-right text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </div>
  );
}

function NewProcessDialog({ clients, types, collabs, onDone }: { clients: any[]; types: any[]; collabs: any[]; onDone: () => void }) {
  const [f, setF] = useState({
    client_id: "", process_type_id: "", responsavel_id: "", prazo_final: "", prioridade: "media", observacoes: "",
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("open_company_process", {
        _client_id: f.client_id,
        _process_type_id: f.process_type_id,
        _responsavel_id: f.responsavel_id || null,
        _prazo_final: f.prazo_final || null,
        _prioridade: f.prioridade,
        _observacoes: f.observacoes || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => { toast.success("Processo aberto"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao abrir processo"),
  });
  const canSave = !!f.client_id && !!f.process_type_id;
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Novo processo</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Empresa *</Label>
          <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{clientLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de processo *</Label>
          <Select value={f.process_type_id} onValueChange={(v) => setF({ ...f, process_type_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={f.responsavel_id} onValueChange={(v) => setF({ ...f, responsavel_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {collabs.map((c) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={f.prioridade} onValueChange={(v) => setF({ ...f, prioridade: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo final</Label>
            <Input type="date" value={f.prazo_final} onChange={(e) => setF({ ...f, prazo_final: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!canSave || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Abrindo…" : "Abrir processo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
