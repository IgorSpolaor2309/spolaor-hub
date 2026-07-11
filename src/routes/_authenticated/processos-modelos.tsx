import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { useCurrentUser } from "@/hooks/use-current-user";
import { toast } from "sonner";
import { GitBranch, Plus, Pencil, ChevronDown, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";

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

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores." />;
  }
  const isAdmin = role === "admin";

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
            {open && <TypeDialog initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["process-types"] }); }} />}
          </Dialog>
        )}
      />

      <Card className="p-2">
        {typesQ.isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          : (typesQ.data ?? []).length === 0 ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Nenhum modelo cadastrado" description="Crie o primeiro tipo de processo." />
          : (
            <ul className="divide-y">
              {(typesQ.data ?? []).map((t: any) => (
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
                    <span className="text-xs text-muted-foreground">· {t.process_steps?.length ?? 0} etapas</span>
                    <div className="ml-auto flex items-center gap-1">
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DeleteTypeButton id={t.id} onDone={() => qc.invalidateQueries({ queryKey: ["process-types"] })} />
                        </>
                      )}
                    </div>
                  </div>
                  {expanded[t.id] && <StepsSection typeId={t.id} canEdit={isAdmin} />}
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
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

  const steps = stepsQ.data ?? [];

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Etapas</div>
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
      {stepsQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
        : steps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma etapa cadastrada.</p>
        : (
          <ul className="divide-y">
            {steps.map((it: any, idx: number) => (
              <li key={it.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-8 text-xs text-muted-foreground">#{it.ordem}</span>
                  <span className="font-medium">{it.nome}</span>
                  {it.departamento && <Badge variant="outline">{it.departamento}</Badge>}
                  {it.obrigatoria && <Badge variant="secondary">Obrigatória</Badge>}
                  {it.exige_documento && <Badge className="bg-amber-100 text-amber-800">Exige doc.</Badge>}
                  {it.visivel_cliente && <Badge className="bg-blue-100 text-blue-800">Visível ao cliente</Badge>}
                  {it.prazo_dias != null && <span className="text-xs text-muted-foreground">{it.prazo_dias}d</span>}
                  {canEdit && (
                    <div className="ml-auto flex items-center gap-1">
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
                    </div>
                  )}
                </div>
                <StepRequirements stepId={it.id} canEdit={canEdit} />
              </li>
            ))}
          </ul>
        )}
    </div>
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

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("process_step_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito removido"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const items = q.data ?? [];
  return (
    <div className="mt-2 ml-8 rounded border-l-2 bg-muted/20 p-2 pl-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">Requisitos documentais ({items.length})</div>
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
              {r.descricao && <span className="text-muted-foreground">— {r.descricao}</span>}
              {canEdit && <div className="ml-auto"><DeleteButton onConfirm={() => remove.mutate(r.id)} /></div>}
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
