import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import { useMemo, useState } from "react";
import { CalendarClock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DOC_VALIDITY_CATEGORIES, labelOf } from "@/lib/sc-types";
import { formatBR, daysUntilLocal } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/validades")({
  component: ValidadesPage,
});

const CATEGORIAS = DOC_VALIDITY_CATEGORIES;

function daysUntil(date: string | null) {
  return daysUntilLocal(date);
}

function statusFromDays(d: number | null) {
  if (d === null) return { label: "sem validade", tone: "bg-zinc-100 text-zinc-700" };
  if (d < 0) return { label: "vencido", tone: "bg-rose-100 text-rose-800" };
  if (d <= 15) return { label: "vence em até 15 dias", tone: "bg-orange-100 text-orange-800" };
  if (d <= 30) return { label: "vence em até 30 dias", tone: "bg-amber-100 text-amber-800" };
  return { label: "válido", tone: "bg-emerald-100 text-emerald-800" };
}

function ValidadesPage() {
  const { role } = useCurrentUser();
  const isStaff = role === "admin" || role === "collaborator";
  const qc = useQueryClient();
  const [fClient, setFClient] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ["val-clients"],
    queryFn: async () => (await supabase.from("clients").select("id, razao_social").order("razao_social")).data ?? [],
  });

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["docs-validity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, nome, client_id, data_validade, categoria_validade, storage_path, clients(razao_social)")
        .not("data_validade", "is", null)
        .order("data_validade", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => (docs as any[]).filter((d) => {
    const days = daysUntil(d.data_validade);
    const st = statusFromDays(days).label;
    return (fClient === "all" || d.client_id === fClient)
      && (fCat === "all" || d.categoria_validade === fCat)
      && (fStatus === "all" || st === fStatus);
  }), [docs, fClient, fCat, fStatus]);

  async function download(path: string, nome: string) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    const a = document.createElement("a"); a.href = data.signedUrl; a.download = nome; a.click();
  }

  return (
    <div>
      <PageHeader
        title="Documentos com validade"
        description="Acompanhe certificados, contratos e certidões prestes a vencer."
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-xs">Cliente</Label>
            <Select value={fClient} onValueChange={setFClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(clients as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
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
            <Label className="text-xs">Situação</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="vence em até 15 dias">Vence em até 15 dias</SelectItem>
                <SelectItem value="vence em até 30 dias">Vence em até 30 dias</SelectItem>
                <SelectItem value="válido">Válido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
          : filtered.length === 0 ? <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nenhum documento com validade" description="Marque a data de validade de um documento para acompanhá-lo aqui." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4">Documento</th>
                    <th className="py-2 pr-4">Cliente</th>
                    <th className="py-2 pr-4">Categoria</th>
                    <th className="py-2 pr-4">Validade</th>
                    <th className="py-2 pr-4">Situação</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d: any) => {
                    const days = daysUntil(d.data_validade);
                    const st = statusFromDays(days);
                    return (
                      <tr key={d.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-4 font-medium">{d.nome}</td>
                        <td className="py-2 pr-4">{d.clients?.razao_social ?? "—"}</td>
                        <td className="py-2 pr-4">{d.categoria_validade ? labelOf(CATEGORIAS, d.categoria_validade) : "—"}</td>
                        <td className="py-2 pr-4">{new Date(d.data_validade).toLocaleDateString("pt-BR")}</td>
                        <td className="py-2 pr-4"><Badge className={st.tone}>{st.label}</Badge></td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => download(d.storage_path, d.nome)}>Baixar</Button>
                          {isStaff && (
                            <Button variant="ghost" size="icon" onClick={() => setEditing(d)} aria-label="Editar validade"><Pencil className="h-4 w-4" /></Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      {editing && (
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <EditValidityDialog doc={editing} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["docs-validity"] }); }} />
        </Dialog>
      )}
    </div>
  );
}

function EditValidityDialog({ doc, onDone }: { doc: any; onDone: () => void }) {
  const [data_validade, setDate] = useState<string>(doc.data_validade ?? "");
  const [categoria_validade, setCat] = useState<string>(doc.categoria_validade ?? "");
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("documents")
        .update({ data_validade: data_validade || null, categoria_validade: categoria_validade || null })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Validade atualizada."); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar."),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Editar validade do documento</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5"><Label>Data de validade</Label><Input type="date" value={data_validade} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={categoria_validade || undefined} onValueChange={setCat}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button></DialogFooter>
    </DialogContent>
  );
}
