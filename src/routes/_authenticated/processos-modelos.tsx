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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { GitBranch, Plus, Pencil, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Eye, EyeOff, Globe, Lock, RefreshCw, CheckCircle2, AlertCircle, Clock, Copy, Download, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/processos-modelos")({
  component: ProcessTypesPage,
});

const CATEGORIAS = [
  { value: "societario", label: "Societário" },
  { value: "fiscal", label: "Fiscal" },
  { value: "dp", label: "Departamento Pessoal" },
  { value: "contabil", label: "Contábil" },
  { value: "certificado", label: "Certificado Digital" },
  { value: "regularizacao", label: "Regularização" },
  { value: "outro", label: "Outro" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.value, c.label]));

function ProcessTypesPage() {
  const { role, loading } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"nome" | "mais_usados" | "recentes" | "antigos" | "etapas">("nome");
  const [dupOf, setDupOf] = useState<any>(null);
  const [importInto, setImportInto] = useState<any>(null);

  const typesQ = useQuery({
    queryKey: ["process-types"],
    enabled: !loading && (role === "admin" || role === "collaborator"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("process_types")
        .select("*, process_steps(id)")
        .order("ordem").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const statsQ = useQuery({
    queryKey: ["process-models-stats"],
    enabled: !loading && (role === "admin" || role === "collaborator"),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_process_models_stats");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores." />;
  }
  const isAdmin = role === "admin";

  const statsMap = useMemo(() => {
    const m = new Map<string, any>();
    (statsQ.data ?? []).forEach((s: any) => m.set(s.process_type_id, s));
    return m;
  }, [statsQ.data]);

  const sortedTypes = useMemo(() => {
    const arr = [...(typesQ.data ?? [])];
    const get = (t: any) => statsMap.get(t.id) ?? {};
    switch (sortBy) {
      case "mais_usados": arr.sort((a, b) => (get(b).processos_ativos ?? 0) - (get(a).processos_ativos ?? 0)); break;
      case "recentes": arr.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")); break;
      case "antigos": arr.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")); break;
      case "etapas": arr.sort((a, b) => (get(b).etapas_total ?? 0) - (get(a).etapas_total ?? 0)); break;
      default: arr.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
    }
    return arr;
  }, [typesQ.data, statsMap, sortBy]);

  // Totais agregados para o dashboard
  const totals = useMemo(() => {
    const types = typesQ.data ?? [];
    const stats = statsQ.data ?? [];
    const sum = (k: string) => stats.reduce((a: number, s: any) => a + (s[k] ?? 0), 0);
    return {
      modelos: types.length,
      ativos: types.filter((t: any) => t.status === "ativo").length,
      inativos: types.filter((t: any) => t.status !== "ativo").length,
      etapas: sum("etapas_total"),
      etapas_publicas: sum("etapas_publicas"),
      requisitos: sum("requisitos_total"),
      requisitos_publicos: sum("requisitos_publicos"),
      processos_ativos: sum("processos_ativos"),
    };
  }, [typesQ.data, statsQ.data]);

  return (
    <div>
      <PageHeader
        title="Modelos de processos"
        description="Cadastre tipos de processo e suas etapas padrão."
        action={isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo modelo</Button>
            </DialogTrigger>
            {open && <TypeDialog initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["process-types"] }); qc.invalidateQueries({ queryKey: ["process-models-stats"] }); }} />}
          </Dialog>
        )}
      />

      {/* Dashboard administrativo */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Modelos" value={totals.modelos} />
        <StatCard label="Ativos" value={totals.ativos} tone="emerald" />
        <StatCard label="Inativos" value={totals.inativos} tone="zinc" />
        <StatCard label="Etapas" value={totals.etapas} />
        <StatCard label="Etapas públicas" value={totals.etapas_publicas} tone="blue" />
        <StatCard label="Requisitos" value={totals.requisitos} />
        <StatCard label="Requisitos públicos" value={totals.requisitos_publicos} tone="blue" />
        <StatCard label="Processos ativos" value={totals.processos_ativos} tone="indigo" />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Ordenar por</Label>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome (A→Z)</SelectItem>
            <SelectItem value="mais_usados">Mais utilizados</SelectItem>
            <SelectItem value="etapas">Maior nº de etapas</SelectItem>
            <SelectItem value="recentes">Mais recentes</SelectItem>
            <SelectItem value="antigos">Mais antigos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="p-2">
        {typesQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : sortedTypes.length === 0 ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Nenhum modelo cadastrado" description="Crie o primeiro tipo de processo." />
          : (
            <ul className="divide-y">
              {sortedTypes.map((t: any) => {
                const st = statsMap.get(t.id) ?? {};
                return (
                <li key={t.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}>
                      {expanded[t.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    {t.cor && <span className="h-3 w-3 rounded-full border" style={{ background: t.cor }} />}
                    <span className="font-medium">{t.nome}</span>
                    {t.categoria && <Badge variant="outline">{CAT_LABEL[t.categoria] ?? t.categoria}</Badge>}
                    <Badge className={t.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}>
                      {t.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      · {st.etapas_total ?? t.process_steps?.length ?? 0} etapas
                      {st.etapas_publicas != null && ` (${st.etapas_publicas} públicas)`}
                      {" · "}{st.processos_ativos ?? 0} processos ativos
                    </span>
                    {st.ultima_sincronizacao && (
                      <span className="text-[10px] text-muted-foreground" title="Última sincronização com processos">
                        · sync {new Date(st.ultima_sincronizacao).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" title="Duplicar modelo"
                            onClick={() => setDupOf(t)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Importar visibilidade de outro modelo"
                            onClick={() => setImportInto(t)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DeleteTypeButton id={t.id} onDone={() => { qc.invalidateQueries({ queryKey: ["process-types"] }); qc.invalidateQueries({ queryKey: ["process-models-stats"] }); }} />
                        </>
                      )}
                    </div>
                  </div>
                  {expanded[t.id] && <StepsSection typeId={t.id} canEdit={isAdmin} />}
                </li>
              );})}
            </ul>
          )}
      </Card>

      {dupOf && <DuplicateModelDialog source={dupOf} onClose={(newId) => {
        setDupOf(null);
        qc.invalidateQueries({ queryKey: ["process-types"] });
        qc.invalidateQueries({ queryKey: ["process-models-stats"] });
        if (newId) setExpanded((e) => ({ ...e, [newId]: true }));
      }} />}
      {importInto && <ImportConfigDialog target={importInto} allTypes={typesQ.data ?? []} onClose={() => {
        setImportInto(null);
        qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey[0] === "process-steps" || q.queryKey[0] === "process-step-requirements" || q.queryKey[0] === "process-models-stats") });
      }} />}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "zinc" | "blue" | "indigo" }) {
  const toneCls = tone === "emerald" ? "text-emerald-700"
    : tone === "blue" ? "text-blue-700"
    : tone === "indigo" ? "text-indigo-700"
    : tone === "zinc" ? "text-zinc-600"
    : "text-foreground";
  return (
    <Card className="p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"text-xl font-semibold " + toneCls}>{value}</div>
    </Card>
  );
}

function DuplicateModelDialog({ source, onClose }: { source: any; onClose: (newId?: string) => void }) {
  const [nome, setNome] = useState(source.nome + " (cópia)");
  const [descricao, setDescricao] = useState<string>(source.descricao ?? "");
  const [status, setStatus] = useState<string>("ativo");
  const [openAfter, setOpenAfter] = useState(true);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_duplicate_process_type", {
        _source: source.id, _nome: nome, _descricao: descricao || null, _status: status,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId: string) => { toast.success("Modelo duplicado com sucesso"); onClose(openAfter ? newId : undefined); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao duplicar"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar modelo</DialogTitle>
          <DialogDescription>
            Cria uma cópia independente de "{source.nome}", incluindo etapas, prazos, responsáveis, textos públicos e requisitos. Processos, documentos e histórico não são copiados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1"><Label>Nome do novo modelo *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1"><Label>Descrição</Label><Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="space-y-1"><Label>Status inicial</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={openAfter} onCheckedChange={(v) => setOpenAfter(!!v)} />
            Abrir o novo modelo automaticamente
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button disabled={!nome.trim() || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Duplicando…" : "Duplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportConfigDialog({ target, allTypes, onClose }: { target: any; allTypes: any[]; onClose: () => void }) {
  const [sourceId, setSourceId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const preview = useQuery({
    queryKey: ["import-config-preview", sourceId, target.id],
    enabled: false, // Só usamos a mesma RPC no aplicar (não há dry_run); mostramos resumo pós-aplicação
    queryFn: async () => null,
  });
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_import_model_config", {
        _source: sourceId, _target: target.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Importado: ${data.etapas_atualizadas} etapas e ${data.requisitos_atualizados} requisitos.${data.etapas_sem_correspondencia ? ` ${data.etapas_sem_correspondencia} etapa(s) sem correspondência foram ignoradas.` : ""}`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao importar"),
  });
  void preview;
  const options = allTypes.filter((t: any) => t.id !== target.id);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar configuração pública</DialogTitle>
          <DialogDescription>
            Copia apenas visibilidade e textos públicos (nome, descrição, observação) das etapas e requisitos de outro modelo para "{target.nome}". Ordem, prazos, responsáveis e etapas sem correspondência não são alterados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Modelo de origem</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {options.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            O casamento é feito pelo nome da etapa e do requisito (sem diferenciar maiúsculas). Nenhuma etapa é adicionada, removida ou reordenada.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!sourceId || apply.isPending} onClick={() => setConfirmOpen(true)}>
            Importar
          </Button>
        </DialogFooter>
        {confirmOpen && (
          <Dialog open onOpenChange={(v) => !v && setConfirmOpen(false)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirmar importação</DialogTitle>
                <DialogDescription>
                  Isso vai sobrescrever a visibilidade e os textos públicos das etapas e requisitos de "{target.nome}" que tiverem nome equivalente no modelo de origem. Continuar?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
                <Button disabled={apply.isPending} onClick={() => { setConfirmOpen(false); apply.mutate(); }}>
                  {apply.isPending ? "Aplicando…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}



function DeleteTypeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("process_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Modelo excluído"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });
  return <DeleteButton onConfirm={() => m.mutate()} />;
}

function TypeDialog({ initial, onDone }: { initial: any; onDone: () => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    nome: initial?.nome ?? "",
    categoria: initial?.categoria ?? "outro",
    descricao: initial?.descricao ?? "",
    cor: initial?.cor ?? "#3b82f6",
    icone: initial?.icone ?? "",
    status: initial?.status ?? "ativo",
    ordem: initial?.ordem ?? 0,
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        nome: f.nome.trim(),
        categoria: f.categoria || null,
        descricao: f.descricao || null,
        cor: f.cor || null,
        icone: f.icone || null,
        status: f.status,
        ordem: Number(f.ordem) || 0,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("process_types").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("process_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Modelo atualizado" : "Modelo criado"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{isEdit ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Abertura de Empresa" />
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
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input type="color" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label>Ícone (opcional)</Label>
            <Input value={f.icone} onChange={(e) => setF({ ...f, icone: e.target.value })} placeholder="Ex.: Briefcase" />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as any })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!f.nome.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar modelo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function StepsSection({ typeId, canEdit }: { typeId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<{ step: any; requirements: any[] } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "publicas" | "internas" | "com_reqs" | "sem_reqs">("todas");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const stepsQ = useQuery({
    queryKey: ["process-steps", typeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("process_steps")
        .select("*").eq("process_type_id", typeId).order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("process_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Etapa removida"); qc.invalidateQueries({ queryKey: ["process-steps", typeId] }); qc.invalidateQueries({ queryKey: ["process-types"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, ordem }: { id: string; ordem: number }) => {
      const { error } = await (supabase as any).from("process_steps").update({ ordem }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-steps", typeId] }),
  });

  const patchStep = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("process_steps").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-steps", typeId] }),
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const bulk = useMutation({
    mutationFn: async ({ visible }: { visible: boolean }) => {
      const { data, error } = await (supabase as any).rpc("admin_bulk_set_model_visibility", {
        _process_type_id: typeId, _visible: visible, _include_requirements: true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`${data.etapas} etapa(s) e ${data.requisitos} requisito(s) atualizados`);
      qc.invalidateQueries({ queryKey: ["process-steps", typeId] });
      // invalidate all requirements for this type
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "process-step-requirements" });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const steps = stepsQ.data ?? [];
  const visibleCount = useMemo(() => steps.filter((s: any) => s.visivel_cliente).length, [steps]);

  const reqCountsQ = useQuery({
    queryKey: ["process-steps-req-counts", typeId, steps.length],
    enabled: steps.length > 0,
    queryFn: async () => {
      const ids = steps.map((s: any) => s.id);
      const { data, error } = await (supabase as any).from("process_step_requirements")
        .select("process_step_id").in("process_step_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.process_step_id] = (map[r.process_step_id] ?? 0) + 1; });
      return map;
    },
  });
  const reqCount = (id: string) => reqCountsQ.data?.[id] ?? 0;

  const filteredSteps = useMemo(() => {
    const term = search.trim().toLowerCase();
    return steps.filter((s: any) => {
      if (term && !(`${s.nome} ${s.descricao ?? ""} ${s.nome_publico ?? ""}`.toLowerCase().includes(term))) return false;
      if (filter === "publicas" && !s.visivel_cliente) return false;
      if (filter === "internas" && s.visivel_cliente) return false;
      if (filter === "com_reqs" && reqCount(s.id) === 0) return false;
      if (filter === "sem_reqs" && reqCount(s.id) > 0) return false;
      return true;
    });
  }, [steps, search, filter, reqCountsQ.data]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const bulkSelected = useMutation({
    mutationFn: async ({ patch }: { patch: any }) => {
      const { error } = await (supabase as any).from("process_steps").update(patch).in("id", selectedIds);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selectedIds.length} etapa(s) atualizadas`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["process-steps", typeId] });
      qc.invalidateQueries({ queryKey: ["process-models-stats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Etapas</div>
        {steps.length > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Globe className="h-3 w-3" /> {visibleCount} de {steps.length} visíveis ao cliente
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {canEdit && steps.length > 0 && (
            <>
              <Button size="sm" variant="ghost" className="h-7" disabled={bulk.isPending}
                onClick={() => bulk.mutate({ visible: true })}>
                <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar todas
              </Button>
              <Button size="sm" variant="ghost" className="h-7" disabled={bulk.isPending}
                onClick={() => bulk.mutate({ visible: false })}>
                <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar todas
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setSyncOpen(true)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sincronizar
              </Button>
            </>
          )}
          {canEdit && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar etapa</Button>
              </DialogTrigger>
              {open && <StepDialog typeId={typeId} initial={editing} nextOrdem={steps.length} onDone={() => {
                setOpen(false); setEditing(null);
                qc.invalidateQueries({ queryKey: ["process-steps", typeId] });
                qc.invalidateQueries({ queryKey: ["process-types"] });
              }} />}
            </Dialog>
          )}
        </div>
      </div>

      {/* Filtros rápidos + busca */}
      {steps.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar etapa…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48" />
          {([
            ["todas", "Todas"],
            ["publicas", "Só públicas"],
            ["internas", "Só internas"],
            ["com_reqs", "Com requisitos"],
            ["sem_reqs", "Sem requisitos"],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}>
              <Badge variant={filter === k ? "default" : "outline"} className="cursor-pointer text-[10px]">{l}</Badge>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {filteredSteps.length} de {steps.length} etapa(s)
          </span>
        </div>
      )}

      {/* Barra de seleção múltipla */}
      {canEdit && selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-xs">
          <span className="font-medium">{selectedIds.length} selecionada(s)</span>
          <Button size="sm" variant="ghost" className="h-7" disabled={bulkSelected.isPending}
            onClick={() => bulkSelected.mutate({ patch: { visivel_cliente: true } })}>
            <Eye className="mr-1 h-3.5 w-3.5" /> Tornar públicas
          </Button>
          <Button size="sm" variant="ghost" className="h-7" disabled={bulkSelected.isPending}
            onClick={() => bulkSelected.mutate({ patch: { visivel_cliente: false } })}>
            <EyeOff className="mr-1 h-3.5 w-3.5" /> Tornar internas
          </Button>
          <Button size="sm" variant="ghost" className="h-7" disabled={bulkSelected.isPending}
            onClick={() => bulkSelected.mutate({ patch: { nome_publico: null, descricao_publica: null, observacao_publica: null } })}>
            Limpar textos públicos
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setSelected({})}>
            <X className="mr-1 h-3.5 w-3.5" /> Limpar seleção
          </Button>
        </div>
      )}

      {stepsQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
        : steps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma etapa cadastrada.</p>
        : filteredSteps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma etapa corresponde ao filtro.</p>
        : (
          <ul className="divide-y">
            {filteredSteps.map((it: any) => {
              const idx = steps.findIndex((s: any) => s.id === it.id);
              return (
              <li key={it.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <Checkbox checked={!!selected[it.id]}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [it.id]: !!v }))} />
                  )}
                  <span className="w-8 text-xs text-muted-foreground">#{it.ordem}</span>
                  <span className="font-medium">{it.nome}</span>
                  {it.departamento && <Badge variant="outline">{it.departamento}</Badge>}
                  {it.obrigatoria && <Badge variant="secondary">Obrigatória</Badge>}
                  {it.exige_documento && <Badge className="bg-amber-100 text-amber-800">Exige doc.</Badge>}
                  {it.visivel_cliente
                    ? <Badge className="bg-blue-100 text-blue-800 gap-1"><Globe className="h-3 w-3" /> Visível</Badge>
                    : <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Interna</Badge>}
                  {it.prazo_dias != null && <span className="text-xs text-muted-foreground">{it.prazo_dias}d</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                      onClick={async () => {
                        const { data: reqs } = await (supabase as any).from("process_step_requirements")
                          .select("*").eq("process_step_id", it.id).order("ordem");
                        setPreview({ step: it, requirements: reqs ?? [] });
                      }}>
                      <Eye className="h-3.5 w-3.5" /> Ver como cliente
                    </Button>
                    {canEdit && (
                      <>
                        <label className="ml-1 flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-[11px]" title="Mostrar esta etapa no Portal do Cliente">
                          <Switch checked={!!it.visivel_cliente}
                            onCheckedChange={(v) => patchStep.mutate({ id: it.id, patch: { visivel_cliente: v } })} />
                          Mostrar
                        </label>
                        <PublicTextsPopover
                          title="Textos públicos da etapa"
                          values={{ nome_publico: it.nome_publico, descricao_publica: it.descricao_publica, observacao_publica: it.observacao_publica }}
                          fields={[
                            { key: "nome_publico", label: "Nome público", placeholder: it.nome },
                            { key: "descricao_publica", label: "Descrição pública", textarea: true, placeholder: it.descricao ?? "" },
                            { key: "observacao_publica", label: "Observação pública", textarea: true },
                          ]}
                          onSave={(patch) => patchStep.mutateAsync({ id: it.id, patch })}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === 0}
                          onClick={() => { const prev = steps[idx - 1]; move.mutate({ id: it.id, ordem: prev.ordem }); move.mutate({ id: prev.id, ordem: it.ordem }); }}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === steps.length - 1}
                          onClick={() => { const next = steps[idx + 1]; move.mutate({ id: it.id, ordem: next.ordem }); move.mutate({ id: next.id, ordem: it.ordem }); }}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteButton onConfirm={() => remove.mutate(it.id)} />
                      </>
                    )}
                  </div>
                </div>
                <StepRequirements stepId={it.id} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}

      {preview && (
        <ClientPreviewSheet open={!!preview} onOpenChange={(v) => !v && setPreview(null)}
          step={preview.step} requirements={preview.requirements} />
      )}
      {syncOpen && (
        <SyncVisibilityDialog typeId={typeId} onClose={() => setSyncOpen(false)} />
      )}
    </div>
  );
}

function PublicTextsPopover({ title, values, fields, onSave }: {
  title: string;
  values: Record<string, string | null>;
  fields: { key: string; label: string; textarea?: boolean; placeholder?: string }[];
  onSave: (patch: Record<string, string | null>) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "") as string]))
  );
  const [saving, setSaving] = useState(false);
  const filled = fields.some((f) => (values[f.key] ?? "").toString().trim() !== "");
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setState(Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "") as string]))); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" title="Editar textos exibidos ao cliente">
          <Globe className={"h-3.5 w-3.5 " + (filled ? "text-blue-600" : "text-muted-foreground")} />
          Textos
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-[11px] text-muted-foreground">Deixe em branco para usar o texto interno padrão.</p>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            {f.textarea
              ? <Textarea rows={2} value={state[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))} />
              : <Input value={state[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))} />}
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              const patch: Record<string, string | null> = {};
              for (const f of fields) {
                const v = (state[f.key] ?? "").trim();
                patch[f.key] = v === "" ? null : v;
              }
              await onSave(patch);
              toast.success("Textos públicos atualizados");
              setOpen(false);
            } catch (e: any) { toast.error(e.message ?? "Falha"); } finally { setSaving(false); }
          }}>Salvar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ClientPreviewSheet({ open, onOpenChange, step, requirements }: {
  open: boolean; onOpenChange: (v: boolean) => void; step: any; requirements: any[];
}) {
  const nome = step.nome_publico?.trim() || step.nome;
  const desc = step.descricao_publica?.trim() || step.descricao;
  const obs = step.observacao_publica?.trim();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Visualização como cliente
          </SheetTitle>
          <SheetDescription>Prévia de como esta etapa aparecerá no Portal.</SheetDescription>
        </SheetHeader>
        {!step.visivel_cliente && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            Esta etapa está marcada como <b>Interna</b>. O cliente não vai enxergá-la enquanto o interruptor "Mostrar" estiver desligado.
          </div>
        )}
        <div className="mt-4 rounded border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Etapa {step.ordem}</span>
            <span className="text-sm font-medium">{nome}</span>
            <Badge className="bg-zinc-100 text-zinc-700">Pendente</Badge>
          </div>
          {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
          {obs && <p className="mt-1 text-xs italic text-muted-foreground">{obs}</p>}
          {requirements.filter((r) => r.visivel_cliente).length > 0 && (
            <ul className="mt-2 space-y-1">
              {requirements.filter((r) => r.visivel_cliente).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span className={r.obrigatorio ? "font-medium" : ""}>{r.nome_publico?.trim() || r.nome}</span>
                  {r.obrigatorio && <Badge variant="secondary" className="text-[10px]">Obrigatório</Badge>}
                  {(r.descricao_publica?.trim() || r.descricao) && (
                    <span className="w-full text-[11px] text-muted-foreground">{r.descricao_publica?.trim() || r.descricao}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {requirements.filter((r) => r.visivel_cliente).length === 0 && requirements.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">Nenhum requisito visível ao cliente nesta etapa.</p>
          )}
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground">
          <CheckCircle2 className="mr-1 inline h-3 w-3" /> Simulação — dados reais dependem do processo em andamento.
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SyncVisibilityDialog({ typeId, onClose }: { typeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"only_missing" | "overwrite_all">("only_missing");
  const previewQ = useQuery({
    queryKey: ["sync-visibility-preview", typeId, mode],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_sync_process_visibility", {
        _process_type_id: typeId, _mode: mode, _dry_run: true,
      });
      if (error) throw error;
      return data;
    },
  });
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_sync_process_visibility", {
        _process_type_id: typeId, _mode: mode, _dry_run: false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sincronizado: ${data.etapas_afetadas} etapas, ${data.requisitos_afetados} requisitos em ${data.clientes_afetados} cliente(s).`);
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey[0] === "client-process-detail" || q.queryKey[0] === "processos-list") });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao sincronizar"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sincronizar visibilidade com processos abertos</DialogTitle>
          <DialogDescription>
            Aplica as configurações públicas atuais do modelo aos processos em andamento (concluídos e cancelados são ignorados).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2 rounded border p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" checked={mode === "only_missing"} onChange={() => setMode("only_missing")} className="mt-0.5" />
              <span>
                <b>Somente campos vazios</b>
                <span className="block text-xs text-muted-foreground">
                  Preserva textos personalizados feitos direto no processo. Apenas promove etapas/requisitos a "visível" quando o modelo estiver marcado.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" checked={mode === "overwrite_all"} onChange={() => setMode("overwrite_all")} className="mt-0.5" />
              <span>
                <b>Sobrescrever tudo</b>
                <span className="block text-xs text-muted-foreground">
                  Iguala 100% ao modelo. Textos e visibilidade personalizados serão substituídos.
                </span>
              </span>
            </label>
          </div>
          <div className="rounded border bg-muted/30 p-3 text-sm">
            {previewQ.isLoading ? "Calculando impacto…" : previewQ.error ? "Falha ao pré-visualizar." : (
              <>
                <div><b>{previewQ.data?.etapas_afetadas ?? 0}</b> etapa(s) serão alteradas</div>
                <div><b>{previewQ.data?.requisitos_afetados ?? 0}</b> requisito(s) serão alterados</div>
                <div><b>{previewQ.data?.clientes_afetados ?? 0}</b> cliente(s) receberão registro no histórico</div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={apply.isPending || previewQ.isLoading} onClick={() => apply.mutate()}>
            {apply.isPending ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function StepDialog({ typeId, initial, nextOrdem, onDone }: { typeId: string; initial: any; nextOrdem: number; onDone: () => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    ordem: initial?.ordem ?? nextOrdem,
    departamento: initial?.departamento ?? "",
    prazo_dias: initial?.prazo_dias ?? "",
    prazo_tipo: initial?.prazo_tipo ?? "abertura",
    responsavel_padrao_id: initial?.responsavel_padrao_id ?? "",
    obrigatoria: initial?.obrigatoria ?? true,
    exige_documento: initial?.exige_documento ?? false,
    visivel_cliente: initial?.visivel_cliente ?? false,
    pode_concluir_manual: initial?.pode_concluir_manual ?? true,
  });
  const collabsQ = useQuery({
    queryKey: ["processes-collabs"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators")
        .select("id, user_id, nome_completo").eq("status", "active").order("nome_completo");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.user_id);
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        process_type_id: typeId,
        nome: f.nome.trim(),
        descricao: f.descricao || null,
        ordem: Number(f.ordem) || 0,
        departamento: f.departamento || null,
        prazo_dias: f.prazo_dias === "" ? null : Number(f.prazo_dias),
        prazo_tipo: f.prazo_tipo,
        responsavel_padrao_id: f.responsavel_padrao_id || null,
        obrigatoria: f.obrigatoria,
        exige_documento: f.exige_documento,
        visivel_cliente: f.visivel_cliente,
        pode_concluir_manual: f.pode_concluir_manual,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("process_steps").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("process_steps").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Etapa atualizada" : "Etapa criada"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{isEdit ? "Editar etapa" : "Nova etapa"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Protocolar Junta" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as any })} />
          </div>
          <div className="space-y-1.5">
            <Label>Departamento</Label>
            <Input value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Prazo (dias)</Label>
            <Input type="number" value={f.prazo_dias} onChange={(e) => setF({ ...f, prazo_dias: e.target.value as any })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Contagem do prazo</Label>
            <Select value={f.prazo_tipo} onValueChange={(v) => setF({ ...f, prazo_tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="abertura">A partir da abertura do processo</SelectItem>
                <SelectItem value="anterior">Após a conclusão da etapa anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Responsável padrão</Label>
            <Select value={f.responsavel_padrao_id || "__none__"} onValueChange={(v) => setF({ ...f, responsavel_padrao_id: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Nenhum —</SelectItem>
                {(collabsQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["obrigatoria", "Obrigatória"],
            ["exige_documento", "Exige documento"],
            ["visivel_cliente", "Visível ao cliente"],
            ["pode_concluir_manual", "Pode concluir manualmente"],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Checkbox checked={(f as any)[k]} onCheckedChange={(v) => setF({ ...f, [k]: !!v } as any)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!f.nome.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar etapa"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


function StepRequirements({ stepId, canEdit }: { stepId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [obrigatorio, setObrigatorio] = useState(true);

  const q = useQuery({
    queryKey: ["process-step-requirements", stepId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("process_step_requirements")
        .select("*").eq("process_step_id", stepId).order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["process-step-requirements", stepId] });

  const add = useMutation({
    mutationFn: async () => {
      const nextOrdem = (q.data ?? []).length;
      const { error } = await (supabase as any).from("process_step_requirements").insert({
        process_step_id: stepId, nome: nome.trim(), descricao: descricao || null,
        obrigatorio, ordem: nextOrdem,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito criado"); setNome(""); setDescricao(""); setObrigatorio(true); setShowForm(false); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const toggleObrig = useMutation({
    mutationFn: async ({ id, obrigatorio }: { id: string; obrigatorio: boolean }) => {
      const { error } = await (supabase as any).from("process_step_requirements").update({ obrigatorio }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const patch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("process_step_requirements").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("process_step_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito removido"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const items = q.data ?? [];
  const visibleCount = items.filter((r: any) => r.visivel_cliente).length;
  return (
    <div className="mt-2 ml-8 rounded border-l-2 bg-muted/20 p-2 pl-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">
          Requisitos documentais ({items.length})
          {items.length > 0 && <span className="ml-2 text-[10px]">· {visibleCount} visível(is) ao cliente</span>}
        </div>
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3 w-3" /> Adicionar
          </Button>
        )}
      </div>
      {items.length === 0 && !showForm && <p className="text-[11px] text-muted-foreground">Nenhum requisito cadastrado.</p>}
      {items.length > 0 && (
        <ul className="mb-1 space-y-1">
          {items.map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span>{r.nome}</span>
              {canEdit ? (
                <button type="button" onClick={() => toggleObrig.mutate({ id: r.id, obrigatorio: !r.obrigatorio })}>
                  <Badge variant={r.obrigatorio ? "secondary" : "outline"} className="cursor-pointer text-[10px]">
                    {r.obrigatorio ? "Obrigatório" : "Opcional"}
                  </Badge>
                </button>
              ) : (
                <Badge variant={r.obrigatorio ? "secondary" : "outline"} className="text-[10px]">{r.obrigatorio ? "Obrigatório" : "Opcional"}</Badge>
              )}
              {r.visivel_cliente
                ? <Badge className="bg-blue-100 text-blue-800 gap-1 text-[10px]"><Globe className="h-2.5 w-2.5" /> Visível</Badge>
                : <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="h-2.5 w-2.5" /> Interna</Badge>}
              {r.descricao && <span className="text-muted-foreground">— {r.descricao}</span>}
              {canEdit && (
                <div className="ml-auto flex items-center gap-1">
                  <label className="flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px]" title="Mostrar ao cliente">
                    <Switch checked={!!r.visivel_cliente}
                      onCheckedChange={(v) => patch.mutate({ id: r.id, patch: { visivel_cliente: v } })} />
                    Mostrar
                  </label>
                  <PublicTextsPopover
                    title="Textos públicos do requisito"
                    values={{ nome_publico: r.nome_publico, descricao_publica: r.descricao_publica }}
                    fields={[
                      { key: "nome_publico", label: "Nome público", placeholder: r.nome },
                      { key: "descricao_publica", label: "Descrição pública", textarea: true, placeholder: r.descricao ?? "" },
                    ]}
                    onSave={(p) => patch.mutateAsync({ id: r.id, patch: p })}
                  />
                  <DeleteButton onConfirm={() => remove.mutate(r.id)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {showForm && canEdit && (
        <div className="mt-2 grid gap-2 rounded border bg-background p-2">
          <Input placeholder="Nome do documento (ex.: Contrato social assinado)" value={nome} onChange={(e) => setNome(e.target.value)} className="h-8" />
          <Input placeholder="Descrição/orientação (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-8" />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={obrigatorio} onCheckedChange={(v) => setObrigatorio(!!v)} /> Obrigatório
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={!nome.trim() || add.isPending} onClick={() => add.mutate()}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
