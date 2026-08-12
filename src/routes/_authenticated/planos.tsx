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
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServicesSection } from "@/components/planos/ServicesSection";
import { PlanServicesSection } from "@/components/planos/PlanServicesSection";
import { ClientPlansVigencySection } from "@/components/planos/ClientPlansVigencySection";

import { TIPO_PRECO_PLANO } from "@/lib/services-catalog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { Briefcase, Plus, Pencil, ChevronDown, ChevronRight } from "lucide-react";


export const Route = createFileRoute("/_authenticated/planos")({
  component: PlansPage,
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
const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

const TIPOS = ["B2B", "B2C", "MEI"];
const PERIODICIDADES = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
];
const PRAZO_TIPOS = [
  { value: "sem_prazo", label: "Sem prazo" },
  { value: "dia_fixo", label: "Dia fixo do mês" },
  { value: "ultimo_dia", label: "Último dia do mês" },
  { value: "dias_apos_competencia", label: "Dias após início da competência" },
];

const brl = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PlansPage() {
  const { role, loading } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const plansQ = useQuery({
    queryKey: ["plans"],
    enabled: !loading && (role === "admin" || role === "collaborator"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("*, plan_items(id)")
        .order("status", { ascending: true })
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores." />;
  }
  const isAdmin = role === "admin";

  return (
    <div>
      <PageHeader
        title="Planos e serviços"
        description="Catálogo de planos comerciais, itens mensais do checklist e serviços extraordinários."
      />

      <Tabs defaultValue="planos">
        <TabsList>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="vinculos">Empresas e Vigência</TabsTrigger>
          <TabsTrigger value="servicos">Serviços extraordinários</TabsTrigger>
        </TabsList>

        <TabsContent value="planos" className="space-y-3">
          {isAdmin && (
            <div className="flex justify-end">
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" /> Novo plano</Button>
                </DialogTrigger>
                {open && <PlanDialog initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["plans"] }); }} />}
              </Dialog>
            </div>
          )}
          <Card className="p-2">
            {plansQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
              : (plansQ.data ?? []).length === 0 ? <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Nenhum plano cadastrado" description="Crie o primeiro plano para começar." />
              : (
                <ul className="divide-y">
                  {(plansQ.data ?? []).map((p: any) => (
                    <li key={p.id} className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}>
                          {expanded[p.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                        <span className="font-medium">{p.nome}</span>
                        <Badge variant="outline">{p.tipo_cliente}</Badge>
                        <Badge variant="secondary">{PERIODICIDADES.find((x) => x.value === p.periodicidade)?.label}</Badge>
                        <Badge className={p.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}>
                          {p.status === "ativo" ? "Ativo" : "Inativo"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {p.tipo_preco === "sob_orcamento" ? "Sob orçamento" : `${brl(p.valor_padrao)}/mês`}
                        </span>
                        {p.valor_provisorio && <Badge className="bg-amber-100 text-amber-800">Valor provisório</Badge>}
                        {p.limite_faturamento != null && (
                          <span className="text-xs text-muted-foreground">· até {brl(p.limite_faturamento)}/mês</span>
                        )}
                        <span className="text-xs text-muted-foreground">· {p.plan_items?.length ?? 0} itens</span>
                        <div className="ml-auto flex items-center gap-1">
                          {isAdmin && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <DeletePlanButton planId={p.id} onDone={() => qc.invalidateQueries({ queryKey: ["plans"] })} />
                            </>
                          )}
                        </div>
                      </div>
                      {p.publico_alvo && <p className="ml-9 mt-1 text-xs text-muted-foreground">{p.publico_alvo}</p>}
                      {expanded[p.id] && (
                        <>
                          {p.observacoes_comerciais && (
                            <p className="ml-9 mt-2 text-xs text-muted-foreground">
                              <span className="font-medium">Observações comerciais preliminares: </span>
                              {p.observacoes_comerciais}
                            </p>
                          )}
                          <PlanItemsSection planId={p.id} canEdit={isAdmin} />
                          <PlanServicesSection planId={p.id} canEdit={isAdmin} showOperationLink={true} />

                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </TabsContent>

        <TabsContent value="vinculos">
          <ClientPlansVigencySection isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="servicos">
          <ServicesSection canEdit={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function DeletePlanButton({ planId, onDone }: { planId: string; onDone: () => void }) {
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("plans").delete().eq("id", planId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plano excluído"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });
  return <DeleteButton onConfirm={() => m.mutate()} />;
}

function PlanDialog({ initial, onDone }: { initial: any; onDone: () => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    nome: initial?.nome ?? "",
    tipo_cliente: initial?.tipo_cliente ?? "B2B",
    valor_padrao: initial?.valor_padrao ?? "",
    periodicidade: initial?.periodicidade ?? "mensal",
    status: initial?.status ?? "ativo",
    descricao: initial?.descricao ?? "",
    publico_alvo: initial?.publico_alvo ?? "",
    limite_faturamento: initial?.limite_faturamento ?? "",
    tipo_preco: initial?.tipo_preco ?? "fixo",
    valor_provisorio: initial?.valor_provisorio ?? true,
    observacoes_comerciais: initial?.observacoes_comerciais ?? "",
  });
  const sobOrcamento = f.tipo_preco === "sob_orcamento";
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        nome: f.nome.trim(),
        tipo_cliente: f.tipo_cliente,
        valor_padrao: sobOrcamento || f.valor_padrao === "" ? null : Number(f.valor_padrao),
        periodicidade: f.periodicidade,
        status: f.status,
        descricao: f.descricao || null,
        publico_alvo: f.publico_alvo || null,
        limite_faturamento: f.limite_faturamento === "" ? null : Number(f.limite_faturamento),
        tipo_preco: f.tipo_preco,
        valor_provisorio: f.valor_provisorio,
        observacoes_comerciais: f.observacoes_comerciais || null,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("plans").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Plano atualizado" : "Plano criado"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{isEdit ? "Editar plano" : "Novo plano"}</DialogTitle></DialogHeader>
      <div className="grid max-h-[70vh] gap-3 overflow-y-auto">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Público-alvo</Label>
          <Input placeholder="ex.: Simples Nacional, Anexo III" value={f.publico_alvo} onChange={(e) => setF({ ...f, publico_alvo: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo de cliente</Label>
            <Select value={f.tipo_cliente} onValueChange={(v) => setF({ ...f, tipo_cliente: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <Select value={f.periodicidade} onValueChange={(v) => setF({ ...f, periodicidade: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODICIDADES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de preço</Label>
            <Select value={f.tipo_preco} onValueChange={(v) => setF({ ...f, tipo_preco: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPO_PRECO_PLANO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor mensal (R$)</Label>
            <Input type="number" step="0.01" disabled={sobOrcamento} value={sobOrcamento ? "" : f.valor_padrao}
              onChange={(e) => setF({ ...f, valor_padrao: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Limite de faturamento mensal (R$)</Label>
            <Input type="number" step="0.01" value={f.limite_faturamento} onChange={(e) => setF({ ...f, limite_faturamento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.valor_provisorio} onCheckedChange={(v) => setF({ ...f, valor_provisorio: !!v })} />
          Valor provisório
        </label>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Observações comerciais preliminares (não publicadas)</Label>
          <Textarea rows={3} value={f.observacoes_comerciais} onChange={(e) => setF({ ...f, observacoes_comerciais: e.target.value })} />
        </div>
      </div>

      <DialogFooter>
        <Button disabled={!f.nome.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar plano"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PlanItemsSection({ planId, canEdit }: { planId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const itemsQ = useQuery({
    queryKey: ["plan_items", planId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plan_items").select("*").eq("plan_id", planId)
        .order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("plan_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Item removido"); qc.invalidateQueries({ queryKey: ["plan_items", planId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Itens mensais do checklist</div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar item</Button>
            </DialogTrigger>
            {open && <PlanItemDialog planId={planId} initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["plan_items", planId] }); qc.invalidateQueries({ queryKey: ["plans"] }); }} />}
          </Dialog>
        )}
      </div>
      {itemsQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
        : (itemsQ.data ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Nenhum item cadastrado.</p>
        : (
          <ul className="divide-y">
            {(itemsQ.data as any[]).map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-8 text-xs text-muted-foreground">#{it.ordem}</span>
                <span className="font-medium">{it.titulo}</span>
                <Badge variant="outline">{CAT_LABEL[it.categoria] ?? it.categoria}</Badge>
                {!it.ativo && <Badge className="bg-zinc-200 text-zinc-700">Inativo</Badge>}
                {it.obrigatorio && <Badge variant="secondary">Obrigatório</Badge>}
                {it.exige_documento && <Badge className="bg-amber-100 text-amber-800">Exige doc.</Badge>}
                {it.visivel_cliente && <Badge className="bg-blue-100 text-blue-800">Visível ao cliente</Badge>}
                <span className="text-xs text-muted-foreground">
                  {PRAZO_TIPOS.find((x) => x.value === it.prazo_tipo)?.label}
                  {it.prazo_valor != null && (it.prazo_tipo === "dia_fixo" || it.prazo_tipo === "dias_apos_competencia") ? ` (${it.prazo_valor})` : ""}
                </span>
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <DeleteButton onConfirm={() => remove.mutate(it.id)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function PlanItemDialog({ planId, initial, onDone }: { planId: string; initial: any; onDone: () => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    titulo: initial?.titulo ?? "",
    categoria: initial?.categoria ?? "outro",
    descricao: initial?.descricao ?? "",
    prazo_tipo: initial?.prazo_tipo ?? "sem_prazo",
    prazo_valor: initial?.prazo_valor ?? "",
    competencia_aplicavel: initial?.competencia_aplicavel ?? "todos",
    ordem: initial?.ordem ?? 0,
    ativo: initial?.ativo ?? true,
    obrigatorio: initial?.obrigatorio ?? true,
    exige_documento: initial?.exige_documento ?? false,
    pode_concluir_manual: initial?.pode_concluir_manual ?? true,
    departamento: initial?.departamento ?? "",
    visivel_cliente: initial?.visivel_cliente ?? false,
  });
  const needsValor = f.prazo_tipo === "dia_fixo" || f.prazo_tipo === "dias_apos_competencia";
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        plan_id: planId,
        titulo: f.titulo.trim(),
        categoria: f.categoria,
        descricao: f.descricao || null,
        prazo_tipo: f.prazo_tipo,
        prazo_valor: needsValor && f.prazo_valor !== "" ? Number(f.prazo_valor) : null,
        competencia_aplicavel: f.competencia_aplicavel,
        ordem: Number(f.ordem) || 0,
        ativo: f.ativo, obrigatorio: f.obrigatorio,
        exige_documento: f.exige_documento,
        pode_concluir_manual: f.pode_concluir_manual,
        departamento: f.departamento || null,
        visivel_cliente: f.visivel_cliente,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("plan_items").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("plan_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Item atualizado" : "Item criado"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{isEdit ? "Editar item do plano" : "Novo item do plano"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as any })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de prazo</Label>
            <Select value={f.prazo_tipo} onValueChange={(v) => setF({ ...f, prazo_tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRAZO_TIPOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{f.prazo_tipo === "dia_fixo" ? "Dia do mês" : f.prazo_tipo === "dias_apos_competencia" ? "Dias após início" : "Valor"}</Label>
            <Input type="number" disabled={!needsValor} value={f.prazo_valor} onChange={(e) => setF({ ...f, prazo_valor: e.target.value as any })} />
          </div>
          <div className="space-y-1.5">
            <Label>Competência aplicável</Label>
            <Select value={f.competencia_aplicavel} onValueChange={(v) => setF({ ...f, competencia_aplicavel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Departamento (opcional)</Label>
            <Input value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["ativo", "Ativo"],
            ["obrigatorio", "Obrigatório"],
            ["exige_documento", "Exige documento"],
            ["pode_concluir_manual", "Pode concluir manualmente"],
            ["visivel_cliente", "Visível para o cliente"],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Checkbox checked={(f as any)[k]} onCheckedChange={(v) => setF({ ...f, [k]: !!v } as any)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {isEdit ? <ApplyToCurrentButton planItemId={initial.id} /> : <span />}
        <Button disabled={!f.titulo.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar item"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ApplyToCurrentButton({ planItemId }: { planItemId: string }) {
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("apply_plan_item_to_current", { _plan_item_id: planItemId });
      if (error) throw error;
      return data as { competencia: string; empresas_analisadas: number; criados: number; ignorados: number; empresas_sem_plano: number; duracao_ms: number };
    },
    onSuccess: (r) => {
      toast.success(
        `Competência ${r.competencia}: ${r.criados} criados, ${r.ignorados} ignorados, ${r.empresas_analisadas} analisadas (${r.duracao_ms}ms).`
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar"),
  });
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => {
      if (confirm("Aplicar este item à competência atual em todas as empresas com este plano?")) run.mutate();
    }} disabled={run.isPending}>
      {run.isPending ? "Aplicando…" : "Aplicar à competência atual"}
    </Button>
  );
}
