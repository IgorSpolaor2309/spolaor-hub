import { createFileRoute } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatBR, todayLocalYmd } from "@/lib/dates";
import { toast } from "sonner";
import { ListChecks, Plus, Check, Inbox as InboxIcon, X, Pencil, Send, Sparkles, ChevronDown, ChevronRight, FileDown } from "lucide-react";
import { AttachmentButton } from "@/components/sc/AttachmentButton";

function defaultCompetencia() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function GenerateChecklistButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [comp, setComp] = useState(defaultCompetencia());
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("generate_plan_checklist", { _competencia: comp });
      if (error) throw error;
      return data as { criados: number; ignorados_existentes: number; empresas_sem_plano: number };
    },
    onSuccess: (r) => {
      toast.success(`Gerado: ${r.criados} criados · ${r.ignorados_existentes} já existiam · ${r.empresas_sem_plano} sem plano`);
      setOpen(false);
      onDone();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao gerar"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Sparkles className="mr-2 h-4 w-4" /> Gerar checklists da competência</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Gerar checklists</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Competência (AAAA-MM)</Label>
          <Input value={comp} onChange={(e) => setComp(e.target.value)} placeholder="2026-07" />
          <p className="text-xs text-muted-foreground">
            Gera os itens do plano de cada empresa ativa para essa competência. Não duplica itens existentes.
          </p>
        </div>
        <DialogFooter>
          <Button disabled={!/^\d{4}-\d{2}$/.test(comp) || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/checklist")({
  component: ChecklistPage,
  errorComponent: () => <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Não foi possível carregar" description="Tente novamente em instantes." />,
});

const CATEGORIAS = [
  { value: "fiscal", label: "Fiscal" },
  { value: "contabil", label: "Contábil" },
  { value: "dp", label: "Departamento Pessoal" },
  { value: "financeiro", label: "Financeiro" },
  { value: "juridico", label: "Jurídico" },
  { value: "cadastro", label: "Cadastro" },
  { value: "outro", label: "Outro" },
];

const STATUS = [
  { value: "pendente", label: "Pendente", tone: "bg-amber-100 text-amber-800", icon: "🟡" },
  { value: "recebido", label: "Recebido", tone: "bg-emerald-100 text-emerald-800", icon: "🟢" },
  { value: "concluido", label: "Concluído", tone: "bg-green-100 text-green-900", icon: "✅" },
  { value: "cancelado", label: "Cancelado", tone: "bg-zinc-200 text-zinc-700", icon: "❌" },
];

const STATUS_MAP = Object.fromEntries(STATUS.map((s) => [s.value, s]));
const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

type PrazoTone = "vencido" | "hoje" | "3dias" | "ok" | "sem";

function prazoTone(prazo: string | null, status: string): PrazoTone {
  if (!prazo || status === "concluido" || status === "cancelado") return "sem";
  const t = todayLocalYmd();
  if (prazo < t) return "vencido";
  if (prazo === t) return "hoje";
  const d = new Date(prazo + "T00:00:00");
  const now = new Date(t + "T00:00:00");
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff <= 3) return "3dias";
  return "ok";
}

const PRAZO_BADGE: Record<PrazoTone, { label: string; tone: string; icon: string } | null> = {
  vencido: { label: "Atrasado", tone: "bg-red-100 text-red-800", icon: "🔴" },
  hoje: { label: "Vence hoje", tone: "bg-orange-100 text-orange-800", icon: "🟠" },
  "3dias": { label: "Vence em 3 dias", tone: "bg-yellow-100 text-yellow-800", icon: "🟡" },
  ok: null,
  sem: null,
};

function ChecklistPage() {
  const { role, userId, loading } = useCurrentUser();
  const qc = useQueryClient();
  const ready = !loading && !!userId && (role === "admin" || role === "collaborator");

  const [fClient, setFClient] = useState("all");
  const [fResp, setFResp] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [fStatus, setFStatus] = useState<string>("open");
  const [fComp, setFComp] = useState("");
  const [fQuick, setFQuick] = useState<"all" | "atrasado" | "hoje" | "3dias">("all");
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const clientsQ = useQuery({
    queryKey: ["checklist-clients", userId],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients")
        .select("id, razao_social, nome_fantasia, documento, client_commercial(plan_id, plans(nome))")
        .is("deleted_at", null).neq("status", "inactive").order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const collabsQ = useQuery({
    queryKey: ["checklist-collabs"],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators")
        .select("id, user_id, nome_completo").eq("status", "active").order("nome_completo");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.user_id);
    },
  });

  const itemsQ = useQuery({
    queryKey: ["checklist-items"],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await supabase.from("client_checklist_items")
        .select("*, clients(razao_social, nome_fantasia), profiles:responsavel_profile_id(full_name), documents:document_id(id, nome, storage_path)")
        .is("deleted_at", null)
        .order("prazo", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return (itemsQ.data ?? []).filter((r: any) => {
      if (fClient !== "all" && r.client_id !== fClient) return false;
      if (fResp !== "all" && r.responsavel_profile_id !== fResp) return false;
      if (fCat !== "all" && r.categoria !== fCat) return false;
      if (fStatus === "open" && (r.status === "concluido" || r.status === "cancelado")) return false;
      if (fStatus !== "all" && fStatus !== "open" && r.status !== fStatus) return false;
      if (fComp && !(r.competencia ?? "").includes(fComp)) return false;
      if (fQuick !== "all") {
        const p = prazoTone(r.prazo, r.status);
        if (fQuick === "atrasado" && p !== "vencido") return false;
        if (fQuick === "hoje" && p !== "hoje") return false;
        if (fQuick === "3dias" && !(p === "hoje" || p === "3dias")) return false;
      }
      return true;
    });
  }, [itemsQ.data, fClient, fResp, fCat, fStatus, fComp, fQuick]);

  const stats = useMemo(() => {
    const s = { total: 0, pendente: 0, recebido: 0, concluido: 0, cancelado: 0, atrasado: 0 };
    for (const r of filtered as any[]) {
      s.total++;
      if (r.status === "pendente") s.pendente++;
      else if (r.status === "recebido") s.recebido++;
      else if (r.status === "concluido") s.concluido++;
      else if (r.status === "cancelado") s.cancelado++;
      if (prazoTone(r.prazo, r.status) === "vencido") s.atrasado++;
    }
    return s;
  }, [filtered]);

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores acessam o checklist." />;
  }

  const clients = clientsQ.data ?? [];
  const collabs = collabsQ.data ?? [];

  // Plano por empresa
  const planByClient: Record<string, string> = {};
  for (const c of clients as any[]) {
    const cc = Array.isArray(c.client_commercial) ? c.client_commercial[0] : c.client_commercial;
    if (cc?.plans?.nome) planByClient[c.id] = cc.plans.nome;
  }
  const clientsSemPlano = (clients as any[]).filter((c) => !planByClient[c.id]).length;
  const compAtual = defaultCompetencia();
  const empresasComChecklist = new Set(
    (itemsQ.data ?? []).filter((i: any) => i.competencia === compAtual).map((i: any) => i.client_id),
  );
  const empresasSemChecklistMes = (clients as any[])
    .filter((c) => planByClient[c.id] && !empresasComChecklist.has(c.id)).length;

  return (
    <div>
      <PageHeader
        title="Checklist do Cliente"
        description="Acompanhe rapidamente o que cada empresa precisa entregar."
        action={
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <GenerateChecklistButton onDone={() => qc.invalidateQueries({ queryKey: ["checklist-items"] })} />
            )}
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Novo item</Button>
              </DialogTrigger>
              {open && (
                <ItemDialog
                  clients={clients}
                  collabs={collabs}
                  initial={editing}
                  onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["checklist-items"] }); }}
                />
              )}
            </Dialog>
          </div>
        }
      />

      {/* Indicadores */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Pendentes" value={stats.pendente} tone="bg-amber-50 text-amber-800" />
        <StatCard label="Recebidos" value={stats.recebido} tone="bg-emerald-50 text-emerald-800" />
        <StatCard label="Concluídos" value={stats.concluido} tone="bg-green-50 text-green-900" />
        <StatCard label="Atrasados" value={stats.atrasado} tone="bg-red-50 text-red-800" />
        <StatCard label="Empresas sem plano" value={clientsSemPlano} tone="bg-zinc-50 text-zinc-700" />
        <StatCard label={`Sem checklist (${compAtual})`} value={empresasSemChecklistMes} tone="bg-zinc-50 text-zinc-700" />
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={fClient} onValueChange={setFClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Responsável</Label>
            <Select value={fResp} onValueChange={setFResp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {collabs.map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={fCat} onValueChange={setFCat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Competência contém</Label>
            <Input placeholder="2026-06" value={fComp} onChange={(e) => setFComp(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Prazo</Label>
            <Select value={fQuick} onValueChange={(v: any) => setFQuick(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer</SelectItem>
                <SelectItem value="atrasado">🔴 Atrasado</SelectItem>
                <SelectItem value="hoje">🟠 Vence hoje</SelectItem>
                <SelectItem value="3dias">🟡 Próximos 3 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => {
            setFClient("all"); setFResp("all"); setFCat("all"); setFStatus("open"); setFComp(""); setFQuick("all");
          }}>Limpar filtros</Button>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button size="sm" variant={viewMode === "list" ? "default" : "ghost"} onClick={() => setViewMode("list")}>Lista</Button>
            <Button size="sm" variant={viewMode === "grouped" ? "default" : "ghost"} onClick={() => setViewMode("grouped")}>Agrupado</Button>
          </div>
        </div>
      </Card>

      <Card className="p-2">
        {itemsQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : filtered.length === 0 ? <EmptyState icon={<ListChecks className="h-6 w-6" />} title="Nenhum item no checklist" description="Crie o primeiro item para começar." />
          : viewMode === "list" ? (
            <ul className="divide-y">
              {filtered.map((r: any) => (
                <ItemRow key={r.id} item={r} isAdmin={role === "admin"} onEdit={() => { setEditing(r); setOpen(true); }} onChange={() => qc.invalidateQueries({ queryKey: ["checklist-items"] })} />
              ))}
            </ul>
          ) : (
            <GroupedView items={filtered} planByClient={planByClient} isAdmin={role === "admin"}
              onEdit={(it: any) => { setEditing(it); setOpen(true); }}
              onChange={() => qc.invalidateQueries({ queryKey: ["checklist-items"] })} />
          )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className={`p-3 ${tone ?? ""}`}>
      <div className="text-xs">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </Card>
  );
}

function GroupedView({ items, planByClient, isAdmin, onEdit, onChange }: any) {
  type Group = { key: string; clientId: string; competencia: string; empresa: string; plano: string; items: any[] };
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const it of items) {
      const comp = it.competencia ?? "—";
      const key = `${it.client_id}::${comp}`;
      const empresa = it.clients?.nome_fantasia || it.clients?.razao_social || "—";
      const plano = planByClient[it.client_id] ?? "—";
      if (!map.has(key)) map.set(key, { key, clientId: it.client_id, competencia: comp, empresa, plano, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.empresa.localeCompare(b.empresa) || b.competencia.localeCompare(a.competencia));
  }, [items, planByClient]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const total = g.items.length;
        let pend = 0, rec = 0, conc = 0, canc = 0, atr = 0;
        for (const i of g.items) {
          if (i.status === "pendente") pend++;
          else if (i.status === "recebido") rec++;
          else if (i.status === "concluido") conc++;
          else if (i.status === "cancelado") canc++;
          if (prazoTone(i.prazo, i.status) === "vencido") atr++;
        }
        const pct = total ? Math.round((conc / total) * 100) : 0;
        const isOpen = !collapsed[g.key];
        return (
          <div key={g.key} className="rounded-md border">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] === false ? true : false }))}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/40"
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{g.empresa}</span>
                  <Badge variant="outline">Plano: {g.plano}</Badge>
                  <Badge variant="outline">Comp. {g.competencia}</Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {total} itens · {conc} concluídos · {rec} recebidos · {pend} pendentes · {canc} cancelados
                  {atr > 0 ? ` · ${atr} atrasados` : ""} · {pct}% concluído
                </div>
              </div>
            </button>
            {isOpen && (
              <ul className="divide-y border-t">
                {g.items.map((r: any) => (
                  <ItemRow key={r.id} item={r} isAdmin={isAdmin} onEdit={() => onEdit(r)} onChange={onChange} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ item, isAdmin, onEdit, onChange }: any) {
  const { userId } = useCurrentUser();
  const s = STATUS_MAP[item.status];
  const p = prazoTone(item.prazo, item.status);
  const prazoBadge = PRAZO_BADGE[p];

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const patch: any = { status };
      if (status === "concluido") { patch.concluded_at = new Date().toISOString(); patch.concluded_by = userId; }
      if (status === "recebido" && !item.received_at) patch.received_at = new Date().toISOString();
      const { error } = await supabase.from("client_checklist_items").update(patch).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); onChange(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao atualizar"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_checklist_items")
        .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item excluído"); onChange(); },
    onError: (e: any) => toast.error(/permission|row-level/i.test(e?.message ?? "") ? "Sem permissão para excluir." : e.message),
  });

  const solicitar = useMutation({
    mutationFn: async () => {
      const { data: req, error } = await supabase.from("document_requests").insert({
        client_id: item.client_id,
        titulo: item.titulo,
        categoria: item.categoria,
        competencia: item.competencia,
        prazo: item.prazo,
        responsavel_profile_id: item.responsavel_profile_id ?? userId,
        status: "pendente",
      }).select("id").maybeSingle();
      if (error) throw error;
      const { error: e2 } = await supabase.from("client_checklist_items")
        .update({ document_request_id: req?.id ?? null })
        .eq("id", item.id);
      if (e2) throw e2;
    },
    onSuccess: () => { toast.success("Solicitação criada e enviada ao cliente"); onChange(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao solicitar"),
  });

  const empresa = item.clients?.nome_fantasia || item.clients?.razao_social || "—";

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-muted/40">
      <span className="text-lg leading-none" aria-hidden>{s?.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.titulo}</span>
          <Badge className={s?.tone}>{s?.label}</Badge>
          <Badge variant="outline">{CAT_LABEL[item.categoria] ?? item.categoria}</Badge>
          {prazoBadge && <Badge className={prazoBadge.tone}>{prazoBadge.icon} {prazoBadge.label}</Badge>}
          {item.document_request_id && <Badge variant="secondary">Solicitado</Badge>}
          {item.origem === "automatico"
            ? <Badge className="bg-indigo-100 text-indigo-800">Automático do plano</Badge>
            : <Badge variant="outline">Manual</Badge>}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {empresa}
          {item.prazo ? ` · vence ${formatBR(item.prazo)}` : ""}
          {item.competencia ? ` · comp. ${item.competencia}` : ""}
          {item.profiles?.full_name ? ` · resp. ${item.profiles.full_name}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.status === "pendente" && !item.document_request_id && (
          <Button size="sm" variant="ghost" title="Solicitar documento ao cliente"
            onClick={() => solicitar.mutate()} disabled={solicitar.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        )}
        {item.status === "pendente" && (
          <Button size="sm" variant="ghost" title="Marcar como Recebido"
            onClick={() => updateStatus.mutate("recebido")}>
            <InboxIcon className="h-4 w-4" />
          </Button>
        )}
        {(item.status === "pendente" || item.status === "recebido") && (
          <Button size="sm" variant="ghost" title="Marcar como Concluído"
            onClick={() => updateStatus.mutate("concluido")}>
            <Check className="h-4 w-4" />
          </Button>
        )}
        {item.status !== "cancelado" && item.status !== "concluido" && (
          <Button size="sm" variant="ghost" title="Cancelar"
            onClick={() => updateStatus.mutate("cancelado")}>
            <X className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" title="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        {isAdmin && <DeleteButton onConfirm={() => remove.mutate()} />}
      </div>
    </li>
  );
}

function ItemDialog({ clients, collabs, initial, onDone }: any) {
  const { userId } = useCurrentUser();
  const isEdit = !!initial;
  const [f, setF] = useState({
    client_id: initial?.client_id ?? "",
    titulo: initial?.titulo ?? "",
    categoria: initial?.categoria ?? "outro",
    responsavel_profile_id: initial?.responsavel_profile_id ?? userId ?? "",
    prazo: initial?.prazo ?? "",
    competencia: initial?.competencia ?? "",
    observacao: initial?.observacao ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        client_id: f.client_id,
        titulo: f.titulo.trim(),
        categoria: f.categoria,
        responsavel_profile_id: f.responsavel_profile_id || null,
        prazo: f.prazo || null,
        competencia: f.competencia || null,
        observacao: f.observacao || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("client_checklist_items").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        payload.created_by = userId;
        const { error } = await supabase.from("client_checklist_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Item atualizado" : "Item criado"); onDone(); },
    onError: (e: any) => toast.error(/permission|row-level/i.test(e?.message ?? "") ? "Sem permissão para esta empresa." : e.message),
  });

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{isEdit ? "Editar item" : "Novo item do checklist"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Empresa *</Label>
          <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {clients.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={f.responsavel_profile_id} onValueChange={(v) => setF({ ...f, responsavel_profile_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {collabs.map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Competência</Label>
            <Input placeholder="2026-06" value={f.competencia} onChange={(e) => setF({ ...f, competencia: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observação</Label>
          <Textarea rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={!f.client_id || !f.titulo.trim() || save.isPending}>
          {save.isPending ? "Salvando…" : (isEdit ? "Salvar" : "Criar item")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
