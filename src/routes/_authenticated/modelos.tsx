import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useState } from "react";
import { toast } from "sonner";
import { TEMPLATE_CATEGORIES, TEMPLATE_VARIABLES, labelOf } from "@/lib/sc-types";
import { Copy, Pencil, Plus, FileText } from "lucide-react";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";

export const Route = createFileRoute("/_authenticated/modelos")({
  component: TemplatesPage,
});

type Template = {
  id: string;
  titulo: string;
  categoria: string;
  assunto: string | null;
  conteudo: string;
  ativo: boolean;
  escopo: "global" | "pessoal";
  created_by: string | null;
  updated_at: string;
};

function TemplatesPage() {
  const { role, userId } = useCurrentUser();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [useDlg, setUseDlg] = useState<Template | null>(null);
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["message-templates"],
    queryFn: async () => (await supabase.from("message_templates").select("*").order("titulo")).data ?? [],
  });

  const range = resolveRange(dateF.preset, dateF.from, dateF.to);
  const visible = (list as Template[]).filter((t) => {
    if (!isAdmin && !t.ativo) return false;
    if (cat !== "all" && t.categoria !== cat) return false;
    if (q && !`${t.titulo} ${t.assunto ?? ""} ${t.conteudo}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (!inRange(t.updated_at, range)) return false;
    return true;
  });
  const clearFilters = () => { setQ(""); setCat("all"); setDateF(EMPTY_DATE_FILTER); };

  const save = useMutation({
    mutationFn: async (t: Partial<Template>) => {
      if (t.id) {
        const { error } = await supabase.from("message_templates")
          .update({
            titulo: t.titulo, categoria: t.categoria, assunto: t.assunto,
            conteudo: t.conteudo, ativo: t.ativo,
            escopo: isAdmin ? (t.escopo ?? "global") : "pessoal",
          })
          .eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("message_templates").insert({
          titulo: t.titulo!, categoria: t.categoria!, assunto: t.assunto ?? null,
          conteudo: t.conteudo!, ativo: t.ativo ?? true, created_by: userId,
          escopo: isAdmin ? (t.escopo ?? "global") : "pessoal",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      setEditing(null); setCreating(false);
      toast.success("Modelo salvo");
    },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para esta ação." : (e.message ?? "Falha ao salvar")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("message_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["message-templates"] });
      toast.success("Modelo excluído");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });

  if (role && role !== "admin" && role !== "collaborator") {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div>
      <PageHeader
        title="Modelos de mensagens"
        description="Padronize a comunicação com clientes."
        action={(isAdmin || role === "collaborator") && (
          <Button onClick={() => {
            setCreating(true);
            setEditing({
              id: "", titulo: "", categoria: "outros", assunto: "", conteudo: "",
              ativo: true, updated_at: "",
              escopo: isAdmin ? "global" : "pessoal",
              created_by: userId ?? null,
            });
          }}>
            <Plus className="mr-2 h-4 w-4" /> Novo modelo
          </Button>
        )}
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <DateRangeFilter value={dateF} onChange={setDateF} label="Atualizado em" />
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
       visible.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum modelo cadastrado" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <Card key={t.id} className="flex flex-col p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-foreground">{t.titulo}</h3>
                  <p className="text-xs text-muted-foreground">{labelOf(TEMPLATE_CATEGORIES, t.categoria)}</p>
                </div>
                {!t.ativo && <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">Inativo</span>}
              </div>
              {t.assunto && <p className="mb-1 text-xs font-medium text-muted-foreground">Assunto: {t.assunto}</p>}
              <p className="line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-foreground/80">{t.conteudo}</p>
              <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span className={t.escopo === "global" ? "rounded bg-primary/10 px-1.5 py-0.5 text-primary" : "rounded bg-muted px-1.5 py-0.5"}>
                  {t.escopo}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setUseDlg(t)}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Usar modelo
                </Button>
                {(isAdmin || t.created_by === userId) && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(t); setCreating(false); }}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                    </Button>
                    <DeleteButton
                      onConfirm={() => remove.mutate(t.id)}
                      description={`Excluir o modelo "${t.titulo}"? Esta ação não pode ser desfeita.`}
                      iconOnly
                    />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && (setEditing(null), setCreating(false))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{creating ? "Novo modelo" : "Editar modelo"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Título</Label><Input value={editing.titulo} onChange={(e) => setEditing({ ...editing, titulo: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <Select value={editing.categoria} onValueChange={(v) => setEditing({ ...editing, categoria: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Switch checked={editing.ativo} onCheckedChange={(v) => setEditing({ ...editing, ativo: v })} />
                  <Label className="mb-2">Ativo</Label>
                </div>
              </div>
              {isAdmin && (
                <div>
                  <Label>Escopo</Label>
                  <Select value={editing.escopo} onValueChange={(v) => setEditing({ ...editing, escopo: v as "global" | "pessoal" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (visível para toda a equipe)</SelectItem>
                      <SelectItem value="pessoal">Pessoal (apenas eu)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Assunto (opcional)</Label><Input value={editing.assunto ?? ""} onChange={(e) => setEditing({ ...editing, assunto: e.target.value })} /></div>
              <div>
                <Label>Conteúdo</Label>
                <Textarea rows={8} value={editing.conteudo} onChange={(e) => setEditing({ ...editing, conteudo: e.target.value })} />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Variáveis disponíveis: {TEMPLATE_VARIABLES.join(" ")}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setCreating(false); }}>Cancelar</Button>
            <Button disabled={!editing?.titulo || !editing?.conteudo} onClick={() => editing && save.mutate(editing)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!useDlg} onOpenChange={(o) => !o && setUseDlg(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{useDlg?.titulo}</DialogTitle></DialogHeader>
          {useDlg && (
            <div className="space-y-3">
              {useDlg.assunto && (
                <div>
                  <Label>Assunto</Label>
                  <Input readOnly value={useDlg.assunto} onFocus={(e) => e.currentTarget.select()} />
                </div>
              )}
              <div>
                <Label>Conteúdo</Label>
                <Textarea rows={10} readOnly value={useDlg.conteudo} onFocus={(e) => e.currentTarget.select()} />
              </div>
              <Button onClick={() => { navigator.clipboard.writeText(useDlg.conteudo); toast.success("Conteúdo copiado"); }}>
                <Copy className="mr-2 h-4 w-4" /> Copiar conteúdo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
