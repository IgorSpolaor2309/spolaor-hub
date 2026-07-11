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
import { useState, useMemo, useRef } from "react";
import { Plus, Upload, FileText, UserCheck, Paperclip, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatBR, isPastEndOfDay } from "@/lib/dates";
import { normalizeDocTipo, normalizeSlug } from "@/lib/sc-types";

export const Route = createFileRoute("/_authenticated/solicitacoes")({
  component: RequestsPage,
  errorComponent: () => <EmptyState icon={<FileText className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />,
});

// Tipos de solicitação disponíveis para o cliente
const TIPOS: { value: string; label: string }[] = [
  { value: "contrato_social", label: "Contrato Social" },
  { value: "alteracao_contratual", label: "Alteração Contratual" },
  { value: "balanco", label: "Balanço" },
  { value: "balancete", label: "Balancete" },
  { value: "folha_pagamento", label: "Folha de Pagamento" },
  { value: "comprovante_rendimentos", label: "Comprovante de Rendimentos" },
  { value: "declaracao_faturamento", label: "Declaração de Faturamento" },
  { value: "segunda_via_guia", label: "Segunda Via de Guia" },
  { value: "regularizacao", label: "Regularização" },
  { value: "outro", label: "Outro" },
];

const DEPARTAMENTOS = [
  { value: "contabil", label: "Contábil" },
  { value: "fiscal", label: "Fiscal" },
  { value: "pessoal", label: "Pessoal / DP" },
  { value: "societario", label: "Societário" },
  { value: "financeiro", label: "Financeiro" },
  { value: "outros", label: "Outros" },
];

const CATEGORIAS: { value: string; label: string }[] = [
  { value: "notas fiscais", label: "notas fiscais" },
  { value: "extrato bancário", label: "extrato bancário" },
  { value: "folha de pagamento", label: "folha de pagamento" },
  { value: "pró-labore", label: "pró-labore" },
  { value: "contrato social", label: "Contrato Social" },
  { value: "contrato de prestação de serviços", label: "Contrato de Prestação de Serviços" },
  { value: "certificado digital", label: "certificado digital" },
  { value: "documento societário", label: "documento societário" },
  { value: "guia/imposto", label: "guia/imposto" },
  { value: "comprovante de pagamento", label: "comprovante de pagamento" },
  { value: "outros", label: "outros" },
];

const CATEGORIA_ALIASES: Record<string, string> = {
  contrato: "contrato_social",
  contratos: "contrato_social",
  contrato_social: "contrato_social",
};

function normCategoria(v: string | null | undefined): string {
  const n = normalizeSlug(v);
  return CATEGORIA_ALIASES[n] ?? n;
}

// Statuses combinados (fluxo staff→cliente e fluxo cliente→staff)
const STATUSES_STAFF_FLOW = ["pendente", "recebido", "recusado", "reenviar", "cancelado"];
const STATUSES_CLIENT_FLOW = ["solicitado", "em_andamento", "aguardando_cliente", "concluido", "cancelado"];
const ALL_STATUSES = Array.from(new Set([...STATUSES_STAFF_FLOW, ...STATUSES_CLIENT_FLOW]));

const STATUS_TONE: Record<string, string> = {
  "pendente": "bg-amber-100 text-amber-800",
  "recebido": "bg-emerald-100 text-emerald-800",
  "recusado": "bg-rose-100 text-rose-800",
  "reenviar": "bg-amber-100 text-amber-800",
  "cancelado": "bg-zinc-200 text-zinc-700",
  "solicitado": "bg-sky-100 text-sky-800",
  "em_andamento": "bg-indigo-100 text-indigo-800",
  "aguardando_cliente": "bg-amber-100 text-amber-800",
  "concluido": "bg-emerald-100 text-emerald-800",
};

const STATUS_LABEL: Record<string, string> = {
  "pendente": "Pendente",
  "recebido": "Recebido",
  "recusado": "Recusado",
  "reenviar": "Reenviar",
  "cancelado": "Cancelado",
  "solicitado": "Solicitado",
  "em_andamento": "Em andamento",
  "aguardando_cliente": "Aguardando cliente",
  "concluido": "Concluído",
};

function labelTipo(v?: string | null) {
  return TIPOS.find((t) => t.value === v)?.label ?? v ?? "";
}
function labelDep(v?: string | null) {
  return DEPARTAMENTOS.find((d) => d.value === v)?.label ?? v ?? "";
}

function RequestsPage() {
  const { role, userId, loading } = useCurrentUser();
  const qc = useQueryClient();
  const isStaff = role === "admin" || role === "collaborator";
  const ready = !loading && !!userId && !!role;

  const [fClient, setFClient] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fCategoria, setFCategoria] = useState<string>("all");
  const [fOrigem, setFOrigem] = useState<string>("all");
  const [fComp, setFComp] = useState("");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const [open, setOpen] = useState(false);

  const { data: clients = [], error: clientsError } = useQuery({
    queryKey: ["requests-clients", userId, role],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .is("deleted_at", null)
        .neq("status", "inactive")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: items = [], isLoading, error: itemsError } = useQuery({
    queryKey: ["doc-requests", userId, role],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_requests")
        .select("*, clients(razao_social, nome_fantasia), documents(nome, storage_path), profiles:responsavel_profile_id(full_name), autor:criado_por(full_name), company_processes(id, process_types(nome)), company_process_steps(id, ordem, nome), company_process_step_requirements(id, nome)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const loadError = clientsError || itemsError;

  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = useMemo(() => {
    return (items as any[]).filter((r) =>
      (fClient === "all" || r.client_id === fClient) &&
      (fStatus === "all" || r.status === fStatus) &&
      (fCategoria === "all" || normCategoria(r.categoria) === normCategoria(fCategoria)) &&
      (fOrigem === "all"
        || (fOrigem === "cliente" && r.criado_por_role === "client")
        || (fOrigem === "equipe" && r.criado_por_role !== "client")) &&
      (!fComp || (r.competencia ?? "").includes(fComp)) &&
      inRange(r.created_at, range),
    );
  }, [items, fClient, fStatus, fCategoria, fOrigem, fComp, range]);

  const clearFilters = () => {
    setFClient("all"); setFStatus("all"); setFCategoria("all"); setFOrigem("all"); setFComp(""); setDateF(EMPTY_DATE_FILTER);
  };

  if (!ready) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const noCompanies = (clients as any[]).length === 0;

  return (
    <div>
      <PageHeader
        title={isStaff ? "Solicitações de documentos" : "Minhas solicitações"}
        description={isStaff
          ? "Solicite documentos e acompanhe pedidos criados pelos clientes."
          : "Peça documentos ou serviços à contabilidade e acompanhe o andamento."}
        action={
          !noCompanies && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova solicitação
                </Button>
              </DialogTrigger>
              {open && (
                <NewRequestDialog
                  clients={clients as any[]}
                  isStaff={isStaff}
                  onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["doc-requests"] }); }}
                />
              )}
            </Dialog>
          )
        }
      />

      {noCompanies && !isStaff && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Sua conta ainda não está vinculada a nenhuma empresa. Fale com a contabilidade para liberar o acesso.
        </Card>
      )}

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={fClient} onValueChange={setFClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(clients as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social || c.documento || "Empresa"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={fOrigem} onValueChange={setFOrigem}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="equipe">Criadas pela contabilidade</SelectItem>
                <SelectItem value="cliente">Criadas pelo cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={fCategoria} onValueChange={setFCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Competência contém</Label>
            <Input placeholder="2026-06" value={fComp} onChange={(e) => setFComp(e.target.value)} />
          </div>
          <DateRangeFilter value={dateF} onChange={setDateF} label="Criado em" />
        </div>
        <div className="mt-3">
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
      </Card>

      <Card className="p-4">
        {loadError ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />
          : isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
          : filtered.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum registro encontrado." />
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
  const fromClient = item.criado_por_role === "client";
  const finalFileRef = useRef<HTMLInputElement>(null);
  const clientReplyRef = useRef<HTMLInputElement>(null);

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("document_requests").update({ status }).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  const assumir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("document_requests")
        .update({ responsavel_profile_id: userId, status: item.status === "solicitado" ? "em_andamento" : item.status })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Você assumiu esta solicitação."); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("document_requests")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Solicitação excluída."); onChange(); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha ao excluir.")),
  });

  async function uploadClientReply(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const path = `${item.client_id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: doc, error: dErr } = await supabase.from("documents").insert({
        client_id: item.client_id, nome: file.name,
        tipo: normalizeDocTipo(item.tipo_solicitacao ?? item.categoria ?? "outro"),
        competencia: item.competencia ?? null, storage_path: path,
        uploaded_by: userId, status: "recebido",
      }).select("id").maybeSingle();
      if (dErr) throw dErr;
      // Cliente respondendo — volta pra em_andamento pra staff analisar
      const nextStatus = fromClient ? "em_andamento" : "recebido";
      const { error: rErr } = await supabase.from("document_requests")
        .update({ status: nextStatus, document_id: doc?.id ?? null })
        .eq("id", item.id);
      if (rErr) throw rErr;
      toast.success("Resposta enviada.");
      onChange();
    } catch (err: any) {
      toast.error(/row-level security|permission/i.test(err?.message ?? "") ? "Sem permissão para enviar." : (err.message ?? "Falha no envio."));
    } finally { e.target.value = ""; }
  }

  async function uploadFinalAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const path = `${item.client_id}/final/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { error: rErr } = await supabase.from("document_requests")
        .update({ attachment_final_path: path, attachment_final_name: file.name, status: "concluido" })
        .eq("id", item.id);
      if (rErr) throw rErr;
      toast.success("Arquivo entregue ao cliente.");
      onChange();
    } catch (err: any) {
      toast.error(err.message ?? "Falha no envio.");
    } finally { e.target.value = ""; }
  }

  const prazoVencido = !!item.prazo && isPastEndOfDay(item.prazo)
    && !["recebido", "cancelado", "concluido"].includes(item.status);
  const isMine = item.responsavel_profile_id === userId;

  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.titulo}</span>
            <Badge className={STATUS_TONE[item.status] ?? "bg-zinc-100 text-zinc-700"}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Badge>
            {fromClient
              ? <Badge className="bg-violet-100 text-violet-800">Pedido do cliente</Badge>
              : <Badge variant="outline">Solicitado pela contabilidade</Badge>}
            {item.urgencia === "urgente" && <Badge className="bg-rose-100 text-rose-800">Urgente</Badge>}
            {item.tipo_solicitacao && <Badge variant="outline">{labelTipo(item.tipo_solicitacao)}</Badge>}
            {item.departamento && <Badge variant="outline">{labelDep(item.departamento)}</Badge>}
            {item.categoria && <Badge variant="outline">{item.categoria}</Badge>}
            {prazoVencido && <Badge className="bg-orange-100 text-orange-800">prazo vencido</Badge>}
            {item.company_process_id && (
              <Badge className="bg-purple-100 text-purple-800">
                Processo{item.company_processes?.process_types?.nome ? `: ${item.company_processes.process_types.nome}` : ""}
                {item.company_process_steps?.nome ? ` · etapa ${item.company_process_steps.ordem ?? ""} ${item.company_process_steps.nome}` : ""}
              </Badge>
            )}
          </div>
          {item.descricao && <div className="mt-1 text-sm text-muted-foreground">{item.descricao}</div>}
          <div className="mt-1 text-xs text-muted-foreground">
            Empresa: {item.clients?.nome_fantasia || item.clients?.razao_social || "—"}
            {item.autor?.full_name ? ` · Criado por: ${item.autor.full_name}` : ""}
            {item.competencia ? ` · Competência: ${item.competencia}` : ""}
            {item.prazo ? ` · Prazo: ${formatBR(item.prazo)}` : ""}
            {item.profiles?.full_name ? ` · Resp.: ${item.profiles.full_name}` : (isStaff ? " · Resp.: sem responsável" : "")}
          </div>
          {isStaff && item.observacoes_internas && (
            <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
              <span className="font-medium">Obs. interna:</span> {item.observacoes_internas}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {item.documents?.storage_path && (
            <AttachmentButton storagePath={item.documents.storage_path} label="Abrir anexo do cliente" />
          )}
          {item.attachment_final_path && (
            <AttachmentButton storagePath={item.attachment_final_path} label={`Arquivo final${item.attachment_final_name ? `: ${item.attachment_final_name}` : ""}`} />
          )}

          {isStaff ? (
            <>
              <Select value={item.status} onValueChange={(v) => updateStatus.mutate(v)}>
                <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? s}</SelectItem>)}</SelectContent>
              </Select>
              {!isMine && (
                <Button size="sm" variant="outline" onClick={() => assumir.mutate()}>
                  <UserCheck className="mr-2 h-4 w-4" /> Assumir
                </Button>
              )}
              <label>
                <input ref={finalFileRef} type="file" className="hidden" onChange={uploadFinalAttachment} />
                <Button asChild size="sm" variant="outline">
                  <span><Paperclip className="mr-2 h-4 w-4" /> Anexar arquivo final</span>
                </Button>
              </label>
              {item.status !== "concluido" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("concluido")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Concluir
                </Button>
              )}
              <DeleteButton onConfirm={() => remove.mutate()} />
            </>
          ) : (
            <>
              {(item.status === "aguardando_cliente" || item.status === "pendente" || item.status === "reenviar") && (
                <label>
                  <input ref={clientReplyRef} type="file" className="hidden" onChange={uploadClientReply} />
                  <Button asChild size="sm">
                    <span><Upload className="mr-2 h-4 w-4" /> Enviar resposta / documento</span>
                  </Button>
                </label>
              )}
              {fromClient && item.status === "solicitado" && (
                <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("cancelado")}>
                  <XCircle className="mr-2 h-4 w-4" /> Cancelar
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function NewRequestDialog({ clients, isStaff, onDone }: { clients: any[]; isStaff: boolean; onDone: () => void }) {
  const { userId } = useCurrentUser();
  const autoClient = clients.length === 1 ? clients[0].id : "";
  const [f, setF] = useState({
    client_id: autoClient, titulo: "", descricao: "",
    tipo_solicitacao: "", departamento: "", urgencia: "normal",
    categoria: "", competencia: "", prazo: "",
    observacoes_internas: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let document_id: string | null = null;
      if (!isStaff && file) {
        const path = `${f.client_id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { data: doc, error: dErr } = await supabase.from("documents").insert({
          client_id: f.client_id, nome: file.name,
          tipo: normalizeDocTipo(f.tipo_solicitacao || "outro"),
          competencia: f.competencia || null, storage_path: path,
          uploaded_by: userId, status: "recebido",
        }).select("id").maybeSingle();
        if (dErr) throw dErr;
        document_id = doc?.id ?? null;
      }

      const payload: any = {
        client_id: f.client_id,
        titulo: f.titulo.trim(),
        descricao: f.descricao || null,
        tipo_solicitacao: f.tipo_solicitacao || null,
        departamento: f.departamento || null,
        urgencia: f.urgencia || "normal",
        categoria: f.categoria || null,
        competencia: f.competencia || null,
        prazo: f.prazo || null,
        observacoes_internas: isStaff ? (f.observacoes_internas || null) : null,
        responsavel_profile_id: isStaff ? (userId ?? null) : null,
        status: isStaff ? "pendente" : "solicitado",
        document_id,
      };
      const { error } = await supabase.from("document_requests").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isStaff ? "Solicitação criada." : "Solicitação enviada à contabilidade.");
      onDone();
    },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para esta empresa." : (e?.message ?? "Falha ao criar.")),
  });

  const canSubmit = !!f.client_id && !!f.titulo.trim()
    && (isStaff || (!!f.tipo_solicitacao && !!f.departamento && !!f.descricao.trim()));

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{isStaff ? "Nova solicitação de documento" : "Solicitar documento ou serviço"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Empresa *</Label>
          <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })} disabled={clients.length === 1}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {!isStaff && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de solicitação *</Label>
                <Select value={f.tipo_solicitacao} onValueChange={(v) => setF({ ...f, tipo_solicitacao: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Departamento *</Label>
                <Select value={f.departamento} onValueChange={(v) => setF({ ...f, departamento: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DEPARTAMENTOS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Urgência</Label>
              <Select value={f.urgencia} onValueChange={(v) => setF({ ...f, urgencia: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{isStaff ? "Descrição" : "Descrição *"}</Label>
          <Textarea rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>

        {isStaff && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Competência</Label>
              <Input placeholder="2026-06" value={f.competencia} onChange={(e) => setF({ ...f, competencia: e.target.value })} />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{isStaff ? "Prazo de envio" : "Prazo desejado"}</Label>
          <Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
        </div>

        {isStaff && (
          <div className="space-y-1.5">
            <Label>Observações internas</Label>
            <Textarea rows={2} value={f.observacoes_internas} onChange={(e) => setF({ ...f, observacoes_internas: e.target.value })} />
          </div>
        )}

        {!isStaff && (
          <div className="space-y-1.5">
            <Label>Anexo (opcional)</Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
          {save.isPending ? "Enviando…" : (isStaff ? "Criar solicitação" : "Enviar solicitação")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
