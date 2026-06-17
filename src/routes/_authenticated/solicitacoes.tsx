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
import { useState, useMemo } from "react";
import { Plus, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatBR, isPastEndOfDay } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/solicitacoes")({
  component: RequestsPage,
});

const CATEGORIAS = [
  "notas fiscais", "extrato bancário", "folha de pagamento", "pró-labore",
  "contrato", "certificado digital", "documento societário", "guia/imposto",
  "comprovante de pagamento", "outros",
];

const STATUSES = [
  "pendente", "enviado pelo cliente", "em análise", "aprovado", "recusado", "reenviar", "cancelado",
];

const STATUS_TONE: Record<string, string> = {
  "pendente": "bg-amber-100 text-amber-800",
  "enviado pelo cliente": "bg-sky-100 text-sky-800",
  "em análise": "bg-blue-100 text-blue-800",
  "aprovado": "bg-emerald-100 text-emerald-800",
  "recusado": "bg-rose-100 text-rose-800",
  "reenviar": "bg-amber-100 text-amber-800",
  "cancelado": "bg-zinc-200 text-zinc-700",
};

const STATUS_LABEL: Record<string, string> = {
  "reenviar": "reenviar (pendente)",
};


function RequestsPage() {
  const { role, userId } = useCurrentUser();
  const qc = useQueryClient();
  const isStaff = role === "admin" || role === "collaborator";

  const [fClient, setFClient] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fCategoria, setFCategoria] = useState<string>("all");
  const [fComp, setFComp] = useState("");
  const [open, setOpen] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["requests-clients"],
    queryFn: async () => (await supabase.from("clients").select("id, razao_social").order("razao_social")).data ?? [],
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["doc-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_requests")
        .select("*, clients(razao_social), documents(nome, storage_path), profiles:responsavel_profile_id(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return (items as any[]).filter((r) =>
      (fClient === "all" || r.client_id === fClient) &&
      (fStatus === "all" || r.status === fStatus) &&
      (fCategoria === "all" || r.categoria === fCategoria) &&
      (!fComp || (r.competencia ?? "").includes(fComp)),
    );
  }, [items, fClient, fStatus, fCategoria, fComp]);

  return (
    <div>
      <PageHeader
        title="Solicitações de documentos"
        description={isStaff ? "Solicite documentos ao cliente e acompanhe o envio." : "Documentos solicitados pela equipe."}
        action={
          isStaff && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Nova solicitação</Button></DialogTrigger>
              {open && (
                <NewRequestDialog
                  clients={clients as any[]}
                  onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["doc-requests"] }); }}
                />
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
            <Label className="text-xs">Categoria</Label>
            <Select value={fCategoria} onValueChange={setFCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          : filtered.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhuma solicitação" />
          : (
            <ul className="space-y-3">
              {filtered.map((r: any) => (
                <RequestRow key={r.id} item={r} isStaff={isStaff} userId={userId} onChange={() => qc.invalidateQueries({ queryKey: ["doc-requests"] })} />
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

function RequestRow({ item, isStaff, userId, onChange }: any) {
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("document_requests").update({ status }).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  async function uploadAndAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const path = `${item.client_id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: doc, error: dErr } = await supabase.from("documents").insert({
        client_id: item.client_id, nome: file.name, tipo: item.categoria ?? "outro",
        competencia: item.competencia ?? null, storage_path: path, uploaded_by: userId, status: "recebido",
      }).select("id").maybeSingle();
      if (dErr) throw dErr;
      const { error: rErr } = await supabase.from("document_requests")
        .update({ status: "enviado pelo cliente", document_id: doc?.id ?? null })
        .eq("id", item.id);
      if (rErr) throw rErr;
      toast.success("Documento enviado");
      onChange();
    } catch (err: any) {
      toast.error(/row-level security|permission/i.test(err?.message ?? "") ? "Sem permissão para enviar." : (err.message ?? "Falha no envio."));
    } finally { e.target.value = ""; }
  }

  const prazoVencido = !!item.prazo && isPastEndOfDay(item.prazo) && !["aprovado", "cancelado"].includes(item.status);

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.titulo}</span>
            <Badge className={STATUS_TONE[item.status] ?? "bg-zinc-100 text-zinc-700"}>{item.status}</Badge>
            {item.categoria && <Badge variant="outline">{item.categoria}</Badge>}
            {prazoVencido && <Badge className="bg-orange-100 text-orange-800">prazo vencido</Badge>}
          </div>
          {item.descricao && <div className="mt-1 text-sm text-muted-foreground">{item.descricao}</div>}
          <div className="mt-1 text-xs text-muted-foreground">
            Cliente: {item.clients?.razao_social ?? "—"}
            {item.competencia ? ` · Competência: ${item.competencia}` : ""}
            {item.prazo ? ` · Prazo: ${formatBR(item.prazo)}` : ""}
            {item.profiles?.full_name ? ` · Resp.: ${item.profiles.full_name}` : ""}
          </div>
          {isStaff && item.observacoes_internas && (
            <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
              <span className="font-medium">Obs. interna:</span> {item.observacoes_internas}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {item.documents?.storage_path && (
            <AttachmentButton storagePath={item.documents.storage_path} label="Abrir anexo" />
          )}
          {isStaff ? (
            <Select value={item.status} onValueChange={(v) => updateStatus.mutate(v)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            !item.document_id && (
              <label>
                <input type="file" className="hidden" onChange={uploadAndAttach} />
                <Button asChild size="sm"><span><Upload className="mr-2 h-4 w-4" /> Enviar documento</span></Button>
              </label>
            )
          )}
        </div>
      </div>
    </li>
  );
}

function NewRequestDialog({ clients, onDone }: { clients: any[]; onDone: () => void }) {
  const { userId } = useCurrentUser();
  const [f, setF] = useState({
    client_id: "", titulo: "", descricao: "", categoria: "", competencia: "", prazo: "",
    observacoes_internas: "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("document_requests").insert({
        client_id: f.client_id, titulo: f.titulo.trim(),
        descricao: f.descricao || null, categoria: f.categoria || null,
        competencia: f.competencia || null, prazo: f.prazo || null,
        observacoes_internas: f.observacoes_internas || null,
        responsavel_profile_id: userId ?? null,
        status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Solicitação criada."); onDone(); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para este cliente." : (e?.message ?? "Falha ao criar.")),
  });
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Nova solicitação de documento</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Cliente *</Label>
          <Select value={f.client_id || undefined} onValueChange={(v) => setF({ ...f, client_id: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Título *</Label><Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={f.categoria || undefined} onValueChange={(v) => setF({ ...f, categoria: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Competência</Label><Input placeholder="2026-06" value={f.competencia} onChange={(e) => setF({ ...f, competencia: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Prazo de envio</Label><Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Observações internas</Label><Textarea rows={2} value={f.observacoes_internas} onChange={(e) => setF({ ...f, observacoes_internas: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={!f.client_id || !f.titulo.trim() || save.isPending}>
          {save.isPending ? "Salvando…" : "Criar solicitação"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
