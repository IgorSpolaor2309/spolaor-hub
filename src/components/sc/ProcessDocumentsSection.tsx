import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { EmptyState } from "@/components/sc/EmptyState";
import { toast } from "sonner";
import { FileText, Link2, Paperclip, CheckCircle2, AlertCircle, XCircle, Send, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Textarea } from "@/components/ui/textarea";
import { formatBR } from "@/lib/dates";

type Props = {
  processId: string;
  clientId: string;
  steps: Array<{ id: string; ordem: number; nome: string }>;
  canEdit: boolean;
};

export function ProcessDocumentsSection({ processId, clientId, steps, canEdit }: Props) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["process-docs", processId] });
    qc.invalidateQueries({ queryKey: ["process-requirements", processId] });
    qc.invalidateQueries({ queryKey: ["company-process-history", processId] });
  };

  const docsQ = useQuery({
    queryKey: ["process-docs", processId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("company_process_documents")
        .select("id, company_process_step_id, observacao, created_at, created_by, documents(id, nome, tipo, storage_path, deleted_at, client_id)")
        .eq("company_process_id", processId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const reqQ = useQuery({
    queryKey: ["process-requirements", processId],
    queryFn: async () => {
      if (steps.length === 0) return [];
      const stepIds = steps.map(s => s.id);
      const { data, error } = await (supabase as any).from("company_process_step_requirements")
        .select("id, company_process_step_id, nome, descricao, observacao, obrigatorio, ordem, document_id, fulfilled_at, documents(id, nome, storage_path, deleted_at)")
        .in("company_process_step_id", stepIds)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
    enabled: steps.length > 0,
  });

  const reqRequestsQ = useQuery({
    queryKey: ["process-req-requests", processId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("document_requests")
        .select("id, titulo, status, prazo, created_at, company_process_step_requirement_id, responsavel_profile_id, document_id, profiles:responsavel_profile_id(full_name)")
        .eq("company_process_id", processId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("company_process_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vínculo removido"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao remover vínculo"),
  });

  const setReqDoc = useMutation({
    mutationFn: async ({ reqId, docId }: { reqId: string; docId: string | null }) => {
      const { error } = await (supabase as any).from("company_process_step_requirements")
        .update({ document_id: docId }).eq("id", reqId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito atualizado"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const docs = docsQ.data ?? [];
  const reqs = reqQ.data ?? [];
  const reqRequests = reqRequestsQ.data ?? [];
  const activeReqRequestByReqId = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of reqRequests) {
      if (!r.company_process_step_requirement_id) continue;
      // Ativa = não cancelada, não concluída, não recebida (matching o UNIQUE do banco)
      const isActive = !["cancelado", "concluido", "recebido"].includes(r.status);
      const cur = m[r.company_process_step_requirement_id];
      if (isActive && !cur) m[r.company_process_step_requirement_id] = r;
    }
    return m;
  }, [reqRequests]);
  const stepMap = useMemo(() => Object.fromEntries(steps.map(s => [s.id, s])), [steps]);
  const generalDocs = docs.filter((d: any) => !d.company_process_step_id);
  const docsByStep = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const d of docs) if (d.company_process_step_id) (m[d.company_process_step_id] ||= []).push(d);
    return m;
  }, [docs]);
  const reqsByStep = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const r of reqs) (m[r.company_process_step_id] ||= []).push(r);
    return m;
  }, [reqs]);

  return (
    <Card className="mt-3 p-2">
      <div className="flex items-center justify-between border-b px-2 py-2">
        <div className="text-sm font-medium flex items-center gap-2"><FileText className="h-4 w-4" /> Documentos</div>
        {canEdit && (
          <LinkDocDialog processId={processId} clientId={clientId} steps={steps} onDone={invalidate} />
        )}
      </div>

      {/* Documentos gerais */}
      <div className="p-3">
        <div className="mb-1 text-xs font-medium text-muted-foreground uppercase">Gerais do processo</div>
        {docsQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
          : generalDocs.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum documento vinculado.</p>
          : (
            <ul className="divide-y rounded border">
              {generalDocs.map((d: any) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{d.documents?.nome ?? "—"}</span>
                  {d.documents?.deleted_at && <Badge className="bg-red-100 text-red-800">Excluído</Badge>}
                  {d.observacao && <span className="text-xs text-muted-foreground">· {d.observacao}</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <AttachmentButton storagePath={d.documents?.storage_path} label="Abrir" />
                    {canEdit && <DeleteButton onConfirm={() => unlink.mutate(d.id)} iconOnly description="Remover apenas o vínculo (o documento original é preservado)." />}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      {/* Requisitos + documentos por etapa */}
      {steps.length > 0 && (
        <div className="border-t p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground uppercase">Por etapa</div>
          <div className="space-y-3">
            {steps.map((s) => {
              const stepReqs = reqsByStep[s.id] ?? [];
              const stepDocs = docsByStep[s.id] ?? [];
              const total = stepReqs.filter((r: any) => r.obrigatorio).length;
              const met = stepReqs.filter((r: any) => r.obrigatorio && r.document_id && !r.documents?.deleted_at).length;
              if (stepReqs.length === 0 && stepDocs.length === 0) return null;
              return (
                <div key={s.id} className="rounded border bg-muted/20 p-2">
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    <span className="text-xs text-muted-foreground">#{s.ordem}</span>
                    <span className="text-sm font-medium">{s.nome}</span>
                    {total > 0 && (
                      <Badge className={met === total ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                        Obrigatórios {met}/{total}
                      </Badge>
                    )}
                  </div>
                  {stepReqs.length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {stepReqs.map((r: any) => (
                        <RequirementRow key={r.id} req={r} clientId={clientId} canEdit={canEdit}
                          processId={processId} stepId={s.id} stepNome={s.nome}
                          activeRequest={activeReqRequestByReqId[r.id] ?? null}
                          onChanged={invalidate}
                          onSet={(docId) => setReqDoc.mutate({ reqId: r.id, docId })} />
                      ))}
                    </ul>
                  )}
                  {stepDocs.length > 0 && (
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">Documentos vinculados à etapa</div>
                      <ul className="divide-y rounded border bg-background">
                        {stepDocs.map((d: any) => (
                          <li key={d.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{d.documents?.nome ?? "—"}</span>
                            {d.documents?.deleted_at && <Badge className="bg-red-100 text-red-800">Excluído</Badge>}
                            <div className="ml-auto flex items-center gap-1">
                              <AttachmentButton storagePath={d.documents?.storage_path} label="Abrir" />
                              {canEdit && <DeleteButton onConfirm={() => unlink.mutate(d.id)} iconOnly description="Remover apenas o vínculo." />}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            {steps.every((s) => (reqsByStep[s.id] ?? []).length === 0 && (docsByStep[s.id] ?? []).length === 0) && (
              <p className="text-xs text-muted-foreground">Nenhum requisito ou documento por etapa.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}


function RequirementRow({ req, clientId, canEdit, onSet, processId, stepId, stepNome, activeRequest, onChanged }:
  { req: any; clientId: string; canEdit: boolean; onSet: (docId: string | null) => void;
    processId: string; stepId: string; stepNome: string; activeRequest: any | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const doc = req.documents;
  const missing = !req.document_id;
  const removed = req.document_id && doc?.deleted_at;
  const met = req.document_id && !doc?.deleted_at;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-sm">
      {met ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        : removed ? <XCircle className="h-3.5 w-3.5 text-red-600" />
        : <AlertCircle className={`h-3.5 w-3.5 ${req.obrigatorio ? "text-amber-600" : "text-muted-foreground"}`} />}
      <span className={req.obrigatorio ? "font-medium" : ""}>{req.nome}</span>
      {req.obrigatorio ? <Badge variant="secondary" className="text-[10px]">Obrigatório</Badge>
        : <Badge variant="outline" className="text-[10px]">Opcional</Badge>}
      {missing && !activeRequest && <Badge className="bg-zinc-100 text-zinc-700">Pendente</Badge>}
      {removed && <Badge className="bg-red-100 text-red-800">Documento removido</Badge>}
      {met && <span className="text-xs text-muted-foreground">· {doc?.nome}</span>}
      {activeRequest && (
        <Badge className={REQ_STATUS_TONE[activeRequest.status] ?? "bg-zinc-100 text-zinc-700"}>
          Solicitação: {REQ_STATUS_LABEL[activeRequest.status] ?? activeRequest.status}
          {activeRequest.prazo ? ` · prazo ${formatBR(activeRequest.prazo)}` : ""}
        </Badge>
      )}
      {req.observacao && <span className="text-[11px] text-muted-foreground italic">{req.observacao}</span>}
      <div className="ml-auto flex flex-wrap items-center gap-1">
        {met && <AttachmentButton storagePath={doc?.storage_path} label="Abrir" />}
        {activeRequest ? (
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link to="/solicitacoes"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir solicitação</Link>
          </Button>
        ) : canEdit && !met && (
          <>
            <Dialog open={reqOpen} onOpenChange={setReqOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="default" className="h-7">
                  <Send className="mr-1 h-3.5 w-3.5" /> Solicitar ao cliente
                </Button>
              </DialogTrigger>
              {reqOpen && <RequestFromRequirementDialog
                clientId={clientId} processId={processId} stepId={stepId} stepNome={stepNome} req={req}
                onDone={() => { setReqOpen(false); onChanged(); }} onClose={() => setReqOpen(false)} />}
            </Dialog>
          </>
        )}
        {canEdit && (
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-7">
                  <Link2 className="mr-1 h-3.5 w-3.5" />{missing ? "Vincular" : "Substituir"}
                </Button>
              </DialogTrigger>
              {open && <PickDocDialog clientId={clientId} onPick={(id) => { onSet(id); setOpen(false); }} onClose={() => setOpen(false)} />}
            </Dialog>
            {met && (
              <Button size="sm" variant="ghost" className="h-7"
                onClick={() => { if (confirm("Remover atendimento (o documento não será excluído)?")) onSet(null); }}>
                Remover
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function RequestFromRequirementDialog({
  clientId, processId, stepId, stepNome, req, onDone, onClose,
}: {
  clientId: string; processId: string; stepId: string; stepNome: string; req: any;
  onDone: () => void; onClose: () => void;
}) {
  const [titulo, setTitulo] = useState<string>(req.nome ?? "");
  const [descricao, setDescricao] = useState<string>(
    [req.descricao, req.observacao, stepNome ? `Etapa: ${stepNome}` : null].filter(Boolean).join("\n"),
  );
  const [prazo, setPrazo] = useState<string>("");
  const [urgencia, setUrgencia] = useState<string>("normal");
  const [obsInterna, setObsInterna] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        client_id: clientId,
        titulo: titulo.trim(),
        descricao: descricao || null,
        urgencia,
        prazo: prazo || null,
        status: "solicitado",
        tipo_solicitacao: "outro",
        observacoes_internas: obsInterna || null,
        company_process_id: processId,
        company_process_step_id: stepId,
        company_process_step_requirement_id: req.id,
      };
      const { error } = await (supabase as any).from("document_requests").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Solicitação criada e enviada ao cliente."); onDone(); },
    onError: (e: any) => {
      const msg = e?.message ?? "Falha ao criar solicitação.";
      if (/uq_dr_active_per_requirement|duplicate/i.test(msg)) {
        toast.error("Já existe uma solicitação ativa para este requisito.");
      } else if (/row-level security|permission/i.test(msg)) {
        toast.error("Sem permissão para esta empresa.");
      } else toast.error(msg);
    },
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Solicitar documento ao cliente</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="rounded border bg-muted/40 p-2 text-xs text-muted-foreground">
          Vinculada ao requisito <span className="font-medium text-foreground">{req.nome}</span> da etapa <span className="font-medium text-foreground">{stepNome}</span>.
        </div>
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição / orientação ao cliente</Label>
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Urgência</Label>
            <Select value={urgencia} onValueChange={setUrgencia}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Observação interna (opcional)</Label>
          <Textarea rows={2} value={obsInterna} onChange={(e) => setObsInterna(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={!titulo.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Enviando…" : "Criar solicitação"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


function LinkDocDialog({ processId, clientId, steps, onDone }:
  { processId: string; clientId: string; steps: Array<{ id: string; ordem: number; nome: string }>; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [stepId, setStepId] = useState<string>("__none__");
  const [obs, setObs] = useState("");
  const link = useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await (supabase as any).from("company_process_documents").insert({
        company_process_id: processId,
        company_process_step_id: stepId === "__none__" ? null : stepId,
        document_id: docId,
        observacao: obs || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Documento vinculado"); setOpen(false); setObs(""); setStepId("__none__"); onDone(); },
    onError: (e: any) => {
      const msg = e.message ?? "Falha";
      toast.error(/duplicate|uq_cpd_link/i.test(msg) ? "Este documento já está vinculado a este processo/etapa." : msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Link2 className="mr-1 h-3.5 w-3.5" /> Vincular documento</Button>
      </DialogTrigger>
      {open && (
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Vincular documento ao processo</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Etapa (opcional)</Label>
                <Select value={stepId} onValueChange={setStepId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Vínculo geral —</SelectItem>
                    {steps.map((s) => <SelectItem key={s.id} value={s.id}>#{s.ordem} {s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: versão final" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Selecione um documento da empresa</Label>
              <PickDocInline clientId={clientId} onPick={(id) => link.mutate(id)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function PickDocDialog({ clientId, onPick, onClose }: { clientId: string; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Selecionar documento</DialogTitle></DialogHeader>
      <PickDocInline clientId={clientId} onPick={onPick} />
      <DialogFooter><Button variant="ghost" onClick={onClose}>Cancelar</Button></DialogFooter>
    </DialogContent>
  );
}

function PickDocInline({ clientId, onPick }: { clientId: string; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const listQ = useQuery({
    queryKey: ["client-docs-pick", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents")
        .select("id, nome, tipo, competencia, created_at, storage_path")
        .eq("client_id", clientId).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const docs = (listQ.data ?? []).filter((d: any) =>
    !q.trim() || `${d.nome ?? ""} ${d.tipo ?? ""} ${d.competencia ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-2">
      <Input placeholder="Buscar por nome, tipo ou competência…" value={q} onChange={(e) => setQ(e.target.value)} />
      {listQ.isLoading ? <p className="text-xs text-muted-foreground">Carregando…</p>
        : docs.length === 0 ? <EmptyState icon={<FileText className="h-5 w-5" />} title="Nenhum documento encontrado" description="Envie um documento primeiro na página Documentos." />
        : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded border">
            {docs.map((d: any) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <span className="font-medium">{d.nome}</span>
                {d.tipo && <Badge variant="outline" className="text-[10px]">{d.tipo}</Badge>}
                {d.competencia && <span className="text-xs text-muted-foreground">{d.competencia}</span>}
                <div className="ml-auto flex items-center gap-1">
                  <AttachmentButton storagePath={d.storage_path} label="Ver" />
                  <Button size="sm" onClick={() => onPick(d.id)}>Vincular</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
