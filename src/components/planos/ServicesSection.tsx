// FASE S1 — catálogo administrativo de serviços extraordinários.
// Somente cadastro/edição administrativa. Nenhum vínculo com empresas, planos ou checklist.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { Plus, Pencil, Wrench } from "lucide-react";
import {
  TIPO_COBRANCA,
  TIPO_PRECO_SERVICO,
  brl,
  labelOf,
  type ServiceRow,
} from "@/lib/services-catalog";

export function ServicesSection({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("__all");
  const [sit, setSit] = useState("ativo");

  const q = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("services")
        .select("*")
        .order("categoria")
        .order("ordem")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ServiceRow[];
    },
  });

  const categorias = useMemo(
    () => Array.from(new Set((q.data ?? []).map((s) => s.categoria))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [q.data],
  );

  const rows = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return (q.data ?? []).filter(
      (s) =>
        (cat === "__all" || s.categoria === cat) &&
        (sit === "__all" || s.status === sit) &&
        (!term || s.nome.toLowerCase().includes(term)),
    );
  }, [q.data, busca, cat, sit]);

  const toggleStatus = useMutation({
    mutationFn: async (s: ServiceRow) => {
      const { error } = await (supabase as any)
        .from("services")
        .update({ status: s.status === "ativo" ? "inativo" : "ativo" })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  const done = () => {
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label>Pesquisar</Label>
          <Input placeholder="Nome do serviço" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="w-52 space-y-1.5">
          <Label>Categoria</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas</SelectItem>
              {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40 space-y-1.5">
          <Label>Situação</Label>
          <Select value={sit} onValueChange={setSit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo serviço</Button>
            </DialogTrigger>
            {open && <ServiceDialog initial={editing} categorias={categorias} onDone={done} />}
          </Dialog>
        )}
      </div>

      <Card className="p-2">
        {q.isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wrench className="h-6 w-6" />} title="Nenhum serviço encontrado" description="Ajuste os filtros ou cadastre um novo serviço." />
        ) : (
          <ul className="divide-y">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-medium">{s.nome}</span>
                <Badge variant="outline">{s.categoria}</Badge>
                {s.departamento && <Badge variant="secondary">{s.departamento}</Badge>}
                <span className="text-muted-foreground">
                  {s.tipo_preco === "sob_orcamento" ? "Sob orçamento" : brl(s.valor_referencia)}
                  {s.tipo_preco !== "sob_orcamento" && s.unidade_cobranca ? ` / ${s.unidade_cobranca}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">· {labelOf(TIPO_COBRANCA, s.tipo_cobranca)}</span>
                {s.valor_provisorio && <Badge className="bg-amber-100 text-amber-800">Valor provisório</Badge>}
                {s.status !== "ativo" && <Badge className="bg-zinc-200 text-zinc-700">Inativo</Badge>}
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={toggleStatus.isPending} onClick={() => toggleStatus.mutate(s)}>
                      {s.status === "ativo" ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ServiceDialog({
  initial,
  categorias,
  onDone,
}: {
  initial: ServiceRow | null;
  categorias: string[];
  onDone: () => void;
}) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    nome: initial?.nome ?? "",
    categoria: initial?.categoria ?? "",
    descricao: initial?.descricao ?? "",
    departamento: initial?.departamento ?? "",
    tipo_preco: initial?.tipo_preco ?? "fixo",
    tipo_cobranca: initial?.tipo_cobranca ?? "fixo_por_servico",
    unidade_cobranca: initial?.unidade_cobranca ?? "",
    valor_referencia: initial?.valor_referencia != null ? String(initial.valor_referencia) : "",
    valor_provisorio: initial?.valor_provisorio ?? true,
    status: initial?.status ?? "ativo",
    ordem: String(initial?.ordem ?? 0),
    observacoes_internas: initial?.observacoes_internas ?? "",
  });
  const sobOrcamento = f.tipo_preco === "sob_orcamento";

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: f.nome.trim(),
        categoria: f.categoria.trim() || "Outro",
        descricao: f.descricao || null,
        departamento: f.departamento.trim() || null,
        tipo_preco: f.tipo_preco,
        tipo_cobranca: f.tipo_cobranca,
        unidade_cobranca: f.unidade_cobranca.trim() || null,
        valor_referencia: sobOrcamento || f.valor_referencia === "" ? null : Number(f.valor_referencia),
        valor_provisorio: f.valor_provisorio,
        status: f.status,
        ordem: Number(f.ordem) || 0,
        observacoes_internas: f.observacoes_internas || null,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("services").update(payload).eq("id", initial!.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("services").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Serviço atualizado" : "Serviço criado"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{isEdit ? "Editar serviço" : "Novo serviço"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Categoria *</Label>
            <Input list="sc-service-categorias" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} />
            <datalist id="sc-service-categorias">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Departamento responsável (opcional)</Label>
            <Input value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de preço</Label>
            <Select value={f.tipo_preco} onValueChange={(v) => setF({ ...f, tipo_preco: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_PRECO_SERVICO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de cobrança</Label>
            <Select value={f.tipo_cobranca} onValueChange={(v) => setF({ ...f, tipo_cobranca: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_COBRANCA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade de cobrança</Label>
            <Input placeholder="ex.: declaração, funcionário" value={f.unidade_cobranca} onChange={(e) => setF({ ...f, unidade_cobranca: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor de referência (R$)</Label>
            <Input type="number" step="0.01" disabled={sobOrcamento} value={sobOrcamento ? "" : f.valor_referencia}
              onChange={(e) => setF({ ...f, valor_referencia: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Situação</Label>
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
          <Label>Observações internas (não publicadas)</Label>
          <Textarea rows={2} value={f.observacoes_internas} onChange={(e) => setF({ ...f, observacoes_internas: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!f.nome.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar serviço"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
