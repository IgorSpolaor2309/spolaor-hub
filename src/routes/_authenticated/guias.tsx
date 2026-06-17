import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { useMemo, useState } from "react";
import { Plus, Upload, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatBR, isPastEndOfDay } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/guias")({
  component: GuidesPage,
});

const TIPOS = ["DAS", "DARF", "GPS/INSS", "FGTS", "ISS", "IRRF", "pró-labore", "parcelamento", "outro"];
const STATUSES = ["gerada", "enviada ao cliente", "visualizada", "paga", "vencida", "cancelada"];
const STATUS_TONE: Record<string, string> = {
  "gerada": "bg-sky-100 text-sky-800",
  "enviada ao cliente": "bg-blue-100 text-blue-800",
  "visualizada": "bg-indigo-100 text-indigo-800",
  "paga": "bg-emerald-100 text-emerald-800",
  "vencida": "bg-orange-100 text-orange-800",
  "cancelada": "bg-zinc-200 text-zinc-700",
};

function GuidesPage() {
  const { role, userId } = useCurrentUser();
  const isStaff = role === "admin" || role === "collaborator";
  const qc = useQueryClient();
  const [fClient, setFClient] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fComp, setFComp] = useState("");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const [open, setOpen] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["guides-clients"],
    queryFn: async () => (await supabase.from("clients").select("id, razao_social").order("razao_social")).data ?? [],
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["tax-guides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_guides")
        .select("*, clients(razao_social)")
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = useMemo(() => (items as any[]).filter((g) =>
    (fClient === "all" || g.client_id === fClient) &&
    (fStatus === "all" || g.status === fStatus) &&
    (fTipo === "all" || g.tipo === fTipo) &&
    (!fComp || (g.competencia ?? "").includes(fComp)) &&
    inRange(g.vencimento, range),
  ), [items, fClient, fStatus, fTipo, fComp, range]);
  const clearFilters = () => {
    setFClient("all"); setFStatus("all"); setFTipo("all"); setFComp(""); setDateF(EMPTY_DATE_FILTER);
  };

  return (
    <div>
      <PageHeader
        title="Guias e impostos"
        description={isStaff ? "Registre guias enviadas ao cliente e acompanhe pagamentos." : "Guias enviadas pela equipe."}
        action={
          isStaff && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova guia</Button></DialogTrigger>
              {open && (
                <NewGuideDialog clients={clients as any[]} userId={userId} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["tax-guides"] }); }} />
              )}
            </Dialog>

          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <Label className="text-xs">Tipo</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Competência contém</Label>
            <Input placeholder="2026-06" value={fComp} onChange={(e) => setFComp(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
          : filtered.length === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title="Nenhuma guia" />
          : (
            <ul className="space-y-3">
              {filtered.map((g: any) => (
                <GuideRow key={g.id} item={g} isStaff={isStaff} onChange={() => qc.invalidateQueries({ queryKey: ["tax-guides"] })} />
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

function GuideRow({ item, isStaff, onChange }: any) {
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("tax_guides").update({ status }).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tax_guides").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Guia excluída"); onChange(); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha ao excluir.")),
  });

  const removeProof = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tax_guides")
        .update({ comprovante_path: null, comprovante_uploaded_at: null })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Comprovante removido"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });




  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const path = `${item.client_id}/guias/${item.id}-comprovante-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("tax_guides").update({
        comprovante_path: path, comprovante_uploaded_at: new Date().toISOString(), status: "paga",
      }).eq("id", item.id);
      if (error) throw error;
      toast.success("Comprovante enviado");
      onChange();
    } catch (err: any) {
      toast.error(/row-level security|permission/i.test(err?.message ?? "") ? "Sem permissão." : (err.message ?? "Falha."));
    } finally { e.target.value = ""; }
  }

  const vencido = item.vencimento && isPastEndOfDay(item.vencimento) && !["paga", "cancelada"].includes(item.status);

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.tipo}</Badge>
            <Badge className={STATUS_TONE[item.status] ?? "bg-zinc-100 text-zinc-700"}>{item.status}</Badge>
            {vencido && <Badge className="bg-orange-100 text-orange-800">vencida</Badge>}
            {item.valor != null && <span className="font-medium">R$ {Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Cliente: {item.clients?.razao_social ?? "—"}
            {item.competencia ? ` · Competência: ${item.competencia}` : ""}
            {item.vencimento ? ` · Vence: ${formatBR(item.vencimento)}` : ""}
          </div>
          {isStaff && item.observacoes_internas && (
            <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
              <span className="font-medium">Obs. interna:</span> {item.observacoes_internas}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {item.storage_path && (
            <AttachmentButton storagePath={item.storage_path} label="Abrir guia" />
          )}
          {item.comprovante_path && (
            <AttachmentButton storagePath={item.comprovante_path} label="Abrir comprovante" variant="outline" />
          )}
          {isStaff ? (
            <>
              <Select value={item.status} onValueChange={(v) => updateStatus.mutate(v)}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              {item.comprovante_path && (
                <DeleteButton onConfirm={() => removeProof.mutate()} label="Remover comprovante" description="Remover o comprovante anexado? A guia continuará registrada." />
              )}
              <DeleteButton onConfirm={() => remove.mutate()} label="Excluir guia" />
            </>
          ) : (
            !item.comprovante_path && (
              <label>
                <input type="file" className="hidden" onChange={uploadProof} />
                <Button asChild size="sm"><span><Upload className="mr-2 h-4 w-4" /> Enviar comprovante</span></Button>
              </label>
            )
          )}

        </div>
      </div>
    </li>
  );
}

function NewGuideDialog({ clients, userId, onDone }: { clients: any[]; userId: string | null; onDone: () => void }) {
  const [f, setF] = useState({
    client_id: "", tipo: "", competencia: "", vencimento: "", valor: "",
    observacoes_internas: "", status: "gerada",
  });
  const [file, setFile] = useState<File | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      let storage_path: string | null = null;
      let nome_arquivo: string | null = null;
      if (file) {
        storage_path = `${f.client_id}/guias/${Date.now()}-${file.name}`;
        nome_arquivo = file.name;
        const { error: upErr } = await supabase.storage.from("documents").upload(storage_path, file);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("tax_guides").insert({
        client_id: f.client_id, tipo: f.tipo, competencia: f.competencia || null,
        vencimento: f.vencimento || null,
        valor: f.valor ? Number(f.valor.replace(",", ".")) : null,
        observacoes_internas: f.observacoes_internas || null,
        status: f.status, storage_path, nome_arquivo,
        created_by: userId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Guia registrada."); onDone(); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para este cliente." : (e?.message ?? "Falha ao salvar.")),
  });
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Nova guia / imposto</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Cliente *</Label>
          <Select value={f.client_id || undefined} onValueChange={(v) => setF({ ...f, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={f.tipo || undefined} onValueChange={(v) => setF({ ...f, tipo: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Competência</Label><Input placeholder="2026-06" value={f.competencia} onChange={(e) => setF({ ...f, competencia: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Vencimento</Label><Input type="date" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Valor (R$)</Label><Input placeholder="0,00" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Arquivo da guia (opcional)</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="space-y-1.5"><Label>Observações internas</Label><Textarea rows={2} value={f.observacoes_internas} onChange={(e) => setF({ ...f, observacoes_internas: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={!f.client_id || !f.tipo || save.isPending}>
          {save.isPending ? "Salvando…" : "Registrar guia"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
