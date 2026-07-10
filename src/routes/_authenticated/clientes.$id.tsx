import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, PriorityBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { Plus, Upload, ArrowLeft, Pencil, Inbox, Receipt, CalendarClock, KanbanSquare, MessagesSquare, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { useCurrentUser } from "@/hooks/use-current-user";
import { MonthStatusSelector } from "@/routes/_authenticated/index";
import {
  TASK_STATUSES, TASK_PRIORITIES, DOC_TYPES, DOC_STATUSES, INTERACTION_TYPES, CLIENT_TYPES,
  DEPARTMENTS, DOC_VALIDITY_CATEGORIES, labelOf,
} from "@/lib/sc-types";
import { EditClientDialog } from "@/routes/_authenticated/clientes";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = useParams({ from: "/_authenticated/clientes/$id" });
  const { role, userId, loading } = useCurrentUser();
  const ready = !loading && !!userId && !!role && !!id;
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);


  const { data: client, error: clientError } = useQuery({
    queryKey: ["client", id],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["client-tasks", id],
    enabled: ready,
    queryFn: async () => (await supabase.from("pending_tasks").select("*").eq("client_id", id).order("prazo")).data ?? [],
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["client-docs", id],
    enabled: ready,
    queryFn: async () => (await supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: events = [] } = useQuery({
    queryKey: ["client-events", id],
    enabled: ready,
    queryFn: async () => (await supabase.from("timeline_events").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: inters = [] } = useQuery({
    queryKey: ["client-inter", id],
    enabled: ready,
    queryFn: async () => (await supabase.from("interactions").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: reqs = [] } = useQuery({
    queryKey: ["client-reqs", id],
    enabled: ready,
    queryFn: async () => (await supabase.from("document_requirements").select("*").eq("client_id", id)).data ?? [],
  });

  const { data: collabs = [] } = useQuery({
    queryKey: ["client-collabs", id],
    enabled: role === "admin",
    queryFn: async () => (await supabase.from("client_collaborators").select("collaborator_id, collaborators(nome, email)").eq("client_id", id)).data ?? [],
  });

  if (!ready) return <div className="text-sm text-muted-foreground">Carregando…</div>;
  if (clientError) return <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Não foi possível carregar a empresa" description="Verifique se você tem acesso a esta empresa." />;
  if (!client) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div>
      <Link to="/clientes" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para empresas
      </Link>
      <PageHeader
        title={client.razao_social}
        description={client.nome_fantasia ?? ""}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={client.status} />
            {role !== "client" && userId && (
              <MonthStatusSelector clientId={client.id} userId={userId} />
            )}
            {role !== "client" && (
              <Button asChild variant="outline" size="sm">
                <Link to="/interacoes" search={{ client: client.id }}>
                  <MessageSquare className="mr-2 h-4 w-4" /> Abrir conversa
                </Link>
              </Button>
            )}
            {role === "admin" && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar empresa
              </Button>
            )}
          </div>
        }
      />
      {role === "admin" && editOpen && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <EditClientDialog
            client={client}
            onDone={() => {
              setEditOpen(false);
              qc.invalidateQueries({ queryKey: ["client", id] });
              qc.invalidateQueries({ queryKey: ["clients"] });
            }}
          />
        </Dialog>
      )}



      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Documento</div><div className="mt-1 font-mono text-sm">{client.documento ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">E-mail</div><div className="mt-1 text-sm">{client.email ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Telefone</div><div className="mt-1 text-sm">{client.telefone ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Entrada</div><div className="mt-1 text-sm">{formatBR(client.data_entrada)}</div></Card>
      </div>

      {role !== "client" && <CommercialCard clientId={id} canEdit={role === "admin"} />}



      {role !== "client" && (
        <Card className="mb-6 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ações rápidas</div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/solicitacoes"><Inbox className="mr-2 h-4 w-4" /> Solicitar documento</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/guias"><Receipt className="mr-2 h-4 w-4" /> Criar guia/imposto</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/validades"><CalendarClock className="mr-2 h-4 w-4" /> Documentos com validade</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/kanban"><KanbanSquare className="mr-2 h-4 w-4" /> Abrir Kanban</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/modelos"><MessagesSquare className="mr-2 h-4 w-4" /> Usar modelo de mensagem</Link></Button>
          </div>
        </Card>
      )}

      <Tabs defaultValue="pendencias">
        <TabsList>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="interacoes">Interações</TabsTrigger>
          <TabsTrigger value="requisitos">Requisitos</TabsTrigger>
          {role !== "client" && <TabsTrigger value="fiscal">Dados fiscais</TabsTrigger>}
          {role === "admin" && <TabsTrigger value="equipe">Colaboradores responsáveis</TabsTrigger>}
          {role === "admin" && <TabsTrigger value="acessos">Acessos do cliente</TabsTrigger>}
        </TabsList>

        <TabsContent value="pendencias">
          <PendingTab clientId={id} tasks={tasks} canCreate={role === "admin"} canUpdate={role !== "client"} onChange={() => qc.invalidateQueries({ queryKey: ["client-tasks", id] })} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocsTab clientId={id} docs={docs} userId={userId} onChange={() => qc.invalidateQueries({ queryKey: ["client-docs", id] })} />
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="p-5">
            {(() => {
              const visible = (events as any[]).filter((e) => role !== "client" || !String(e.tipo ?? "").startsWith("comercial_"));
              return visible.length === 0 ? <EmptyState title="Sem eventos" /> : (
                <ol className="space-y-4">
                  {visible.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                      <div>
                        <div className="text-sm">{e.descricao}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.tipo} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              );
            })()}

          </Card>
        </TabsContent>

        <TabsContent value="interacoes">
          <InteractionsTab clientId={id} list={inters} canCreate={role !== "client"} onChange={() => qc.invalidateQueries({ queryKey: ["client-inter", id] })} />
        </TabsContent>

        <TabsContent value="requisitos">
          <RequirementsTab clientId={id} list={reqs} canManage={role === "admin"} onChange={() => qc.invalidateQueries({ queryKey: ["client-reqs", id] })} />
        </TabsContent>

        {role !== "client" && (
          <TabsContent value="fiscal">
            <FiscalTab clientId={id} canEdit={role === "admin" || role === "collaborator"} isAdmin={role === "admin"} />
          </TabsContent>
        )}

        {role === "admin" && (
          <TabsContent value="equipe">
            <TeamTab clientId={id} current={collabs} onChange={() => qc.invalidateQueries({ queryKey: ["client-collabs", id] })} />
          </TabsContent>
        )}

        {role === "admin" && (
          <TabsContent value="acessos">
            <ClientUsersTab clientId={id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ---------- Pendências ---------- */
function PendingTab({ clientId, tasks, canCreate, canUpdate, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: "", descricao: "", tipo: "", prazo: "", prioridade: "media", competencia: "", departamento: "" });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form, client_id: clientId, prazo: form.prazo || null, departamento: form.departamento || null };
      const { error } = await supabase.from("pending_tasks").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pendência criada"); setOpen(false); onChange(); setForm({ titulo: "", descricao: "", tipo: "", prazo: "", prioridade: "media", competencia: "", departamento: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "concluida") patch.data_conclusao = new Date().toISOString();
      const { error } = await supabase.from("pending_tasks").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-5">
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nova pendência</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova pendência</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Título *</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
                <div><Label>Descrição</Label><Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Prazo</Label><Input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} /></div>
                  <div><Label>Prioridade</Label>
                    <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tipo</Label><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} /></div>
                  <div><Label>Competência</Label><Input placeholder="ex: 2026-06" value={form.competencia} onChange={(e) => setForm({ ...form, competencia: e.target.value })} /></div>
                </div>
                <div>
                  <Label>Departamento</Label>
                  <Select value={form.departamento || undefined} onValueChange={(v) => setForm({ ...form, departamento: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o departamento" /></SelectTrigger>
                    <SelectContent>{DEPARTMENTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={() => save.mutate()} disabled={!form.titulo || save.isPending}>{save.isPending ? "Salvando…" : "Criar"}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {tasks.length === 0 ? <EmptyState title="Sem pendências" description={canCreate ? "Crie a primeira pendência." : "Tudo em dia!"} /> : (
        <div className="space-y-2">
          {tasks.map((t: any) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">{t.titulo}</div>
                  <PriorityBadge value={t.prioridade} />
                  {t.departamento && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {labelOf(DEPARTMENTS, t.departamento)}
                    </span>
                  )}
                </div>
                {t.descricao && <div className="mt-0.5 text-sm text-muted-foreground">{t.descricao}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.prazo ? `Prazo: ${formatBR(t.prazo)}` : "Sem prazo"} {t.competencia ? ` · ${t.competencia}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canUpdate ? (
                  <Select value={t.status} onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v })}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <StatusBadge value={t.status} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Documentos ---------- */
function DocsTab({ clientId, docs, userId, onChange }: any) {
  const [uploading, setUploading] = useState(false);
  const [tipo, setTipo] = useState("outro");
  const [competencia, setCompetencia] = useState("");
  const [hasValidity, setHasValidity] = useState(false);
  const [dataValidade, setDataValidade] = useState("");
  const [categoriaValidade, setCategoriaValidade] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const path = `${clientId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const payload: any = {
        client_id: clientId, nome: file.name, tipo, competencia: competencia || null,
        storage_path: path, uploaded_by: userId, status: "recebido",
      };
      if (hasValidity) {
        payload.data_validade = dataValidade || null;
        payload.categoria_validade = categoriaValidade || null;
      }
      const { error } = await supabase.from("documents").insert(payload);
      if (error) throw error;
      toast.success("Documento enviado");
      setHasValidity(false); setDataValidade(""); setCategoriaValidade("");
      onChange();
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  }




  return (
    <Card className="p-5">
      <div className="mb-4 space-y-3 rounded-md border bg-muted/30 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Competência</Label>
            <Input className="w-[140px]" placeholder="2026-06" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
          </div>
          <label className="ml-auto">
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            <Button asChild variant="secondary" disabled={uploading}>
              <span><Upload className="mr-2 h-4 w-4" />{uploading ? "Enviando…" : "Enviar documento"}</span>
            </Button>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={hasValidity} onChange={(e) => setHasValidity(e.target.checked)} />
            Documento possui validade?
          </label>
          {hasValidity && (
            <>
              <div className="space-y-1.5"><Label className="text-xs">Data de validade</Label>
                <Input type="date" className="w-[160px]" value={dataValidade} onChange={(e) => setDataValidade(e.target.value)} />
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Categoria da validade</Label>
                <Select value={categoriaValidade || undefined} onValueChange={setCategoriaValidade}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{DOC_VALIDITY_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>
      {docs.length === 0 ? <EmptyState title="Sem documentos" /> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr className="border-b"><th className="py-2 pr-4">Arquivo</th><th>Tipo</th><th>Competência</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {docs.map((d: any) => (
              <tr key={d.id} className="border-b">
                <td className="py-2 pr-4 font-medium">{d.nome}</td>
                <td>{labelOf(DOC_TYPES, d.tipo)}</td>
                <td>{d.competencia ?? "—"}</td>
                <td><StatusBadge value={d.status} /></td>
                <td className="text-right"><AttachmentButton storagePath={d.storage_path} label="Abrir" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ---------- Interactions ---------- */
function InteractionsTab({ clientId, list, canCreate, onChange }: any) {
  const [form, setForm] = useState({ tipo: "observacao", descricao: "" });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("interactions").insert({ client_id: clientId, ...form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Interação registrada"); setForm({ tipo: "observacao", descricao: "" }); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card className="p-5">
      {canCreate && (
        <div className="mb-4 grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div><Label className="text-xs">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{INTERACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Descrição</Label><Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <Button onClick={() => save.mutate()} disabled={!form.descricao || save.isPending}>Registrar</Button>
        </div>
      )}
      {list.length === 0 ? <EmptyState title="Sem interações" /> : (
        <ul className="space-y-3">
          {list.map((i: any) => (
            <li key={i.id} className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground">{labelOf(INTERACTION_TYPES, i.tipo)} · {formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: ptBR })}</div>
              <div className="mt-1 text-sm">{i.descricao}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Requirements ---------- */
function RequirementsTab({ clientId, list, canManage, onChange }: any) {
  const [tipo, setTipo] = useState("");
  const [period, setPeriod] = useState("mensal");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("document_requirements").insert({ client_id: clientId, tipo_documento: tipo, periodicidade: period });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito adicionado"); setTipo(""); onChange(); },
    onError: (e: any) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("document_requirements").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => onChange(),
  });
  return (
    <Card className="p-5">
      {canManage && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
          <div><Label className="text-xs">Tipo de documento *</Label><Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex: Extrato bancário" /></div>
          <div><Label className="text-xs">Periodicidade</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
                <SelectItem value="avulso">Avulso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => add.mutate()} disabled={!tipo || add.isPending}>Adicionar</Button>
        </div>
      )}
      {list.length === 0 ? <EmptyState title="Sem requisitos definidos" /> : (
        <ul className="divide-y">
          {list.map((r: any) => (
            <li key={r.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{r.tipo_documento}</div>
                <div className="text-xs text-muted-foreground">{r.periodicidade}</div>
              </div>
              {canManage && <Button variant="ghost" size="sm" onClick={() => del.mutate(r.id)}>Remover</Button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Colaboradores responsáveis ---------- */
function TeamTab({ clientId, current, onChange }: any) {
  const { data: allCollabs = [] } = useQuery({
    queryKey: ["all-collabs-select"],
    enabled: !!clientId,
    queryFn: async () => (await supabase.from("collaborators").select("id, nome, email").eq("status", "active").order("nome")).data ?? [],
  });
  // Conta cliente vinculada? Usado para alerta quando não há colaborador responsável.
  const { data: clientUsersCount = 0 } = useQuery({
    queryKey: ["client-users-count", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { count } = await supabase
        .from("client_users")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("ativo", true);
      return count ?? 0;
    },
  });

  const [cid, setCid] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  const linkedIds = new Set((current ?? []).map((c: any) => c.collaborator_id));
  const available = (allCollabs as any[]).filter((c) => {
    if (linkedIds.has(c.id)) return false;
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (c.nome ?? "").toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s);
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!cid) throw new Error("Selecione um colaborador.");
      const { error } = await supabase.from("client_collaborators").insert({ client_id: clientId, collaborator_id: cid });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Colaborador vinculado com sucesso."); setCid(undefined); setSearch(""); onChange(); },
    onError: (e: any) => {
      if (e?.code === "23505") { toast.error("Este colaborador já está vinculado a esta empresa."); return; }
      toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Você não tem permissão para realizar esta ação." : (e?.message ?? "Não foi possível vincular o colaborador."));
    },
  });
  const del = useMutation({
    mutationFn: async (collaboratorId: string) => {
      const { error } = await supabase.from("client_collaborators").delete().eq("client_id", clientId).eq("collaborator_id", collaboratorId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Colaborador removido desta empresa."); onChange(); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Você não tem permissão para realizar esta ação." : (e?.message ?? "Não foi possível remover o vínculo.")),
  });

  const isEmpty = !current || current.length === 0;

  return (
    <Card className="p-5">
      {isEmpty && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Empresa sem colaborador responsável.</div>
            {clientUsersCount > 0 && (
              <div className="text-xs">Este cliente possui acesso, mas ainda não há colaborador responsável para comunicação.</div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label className="text-xs">Buscar colaborador</Label>
          <Input placeholder="Nome ou e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Selecionar colaborador</Label>
          <Select value={cid} onValueChange={setCid}>
            <SelectTrigger><SelectValue placeholder={available.length === 0 ? "Nenhum disponível" : "Selecione"} /></SelectTrigger>
            <SelectContent>
              {available.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.email ? ` — ${c.email}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={!cid || add.isPending}>
          {add.isPending ? "Vinculando…" : "Vincular"}
        </Button>
      </div>

      {isEmpty ? <EmptyState title="Nenhum colaborador vinculado." description="Adicione um colaborador para liberar acesso à comunicação, documentos e pendências desta empresa." /> : (
        <ul className="divide-y">
          {current.map((c: any) => (
            <li key={c.collaborator_id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{c.collaborators?.nome ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{c.collaborators?.email ?? ""}</div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm">Remover</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover colaborador?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {c.collaborators?.nome ?? "Este colaborador"} deixará de acessar esta empresa
                      (documentos, solicitações, pendências, guias, histórico, Kanban e chat) e não
                      receberá mais notificações relacionadas a ela.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(c.collaborator_id)}>
                      Remover colaborador
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}


/* ---------- Acessos: usuários-cliente vinculados (multiempresa) ---------- */
function ClientUsersTab({ clientId }: { clientId: string }) {
  const qc = useQueryClient();

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_users")
        .select("id, user_id, papel, ativo, created_at, profiles:user_id(full_name, email)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("responsavel");

  const add = useMutation({
    mutationFn: async () => {
      const e = email.trim().toLowerCase();
      if (!e) throw new Error("Informe o e-mail.");
      const { data: prof, error: pErr } = await supabase
        .from("profiles").select("id, email").ilike("email", e).maybeSingle();
      if (pErr) throw pErr;
      if (!prof?.id) throw new Error("Nenhum usuário encontrado com este e-mail. Crie a conta primeiro em Configurações.");
      const { error } = await supabase
        .from("client_users")
        .insert({ client_id: clientId, user_id: prof.id, papel: papel || null, ativo: true });
      if (error) {
        if (error.code === "23505") throw new Error("Este usuário já está vinculado a esta empresa.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Usuário vinculado à empresa.");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["client-users", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível vincular o usuário."),
  });

  const toggle = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase
        .from("client_users").update({ ativo: !row.ativo }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-users", clientId] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar vínculo."),
  });

  const remove = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from("client_users").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vínculo removido.");
      qc.invalidateQueries({ queryKey: ["client-users", clientId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover vínculo."),
  });

  return (
    <Card className="p-5">
      <div className="mb-2 text-sm text-muted-foreground">
        Usuários cliente que podem acessar <b>esta empresa</b>. A mesma conta pode estar vinculada a várias empresas.
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">E-mail do usuário cliente</Label>
          <Input type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Papel</Label>
          <Select value={papel} onValueChange={setPapel}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="responsavel">Responsável</SelectItem>
              <SelectItem value="financeiro">Financeiro</SelectItem>
              <SelectItem value="socio">Sócio</SelectItem>
              <SelectItem value="operacional">Operacional</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={!email.trim() || add.isPending}>
          {add.isPending ? "Vinculando…" : "Vincular usuário"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : links.length === 0 ? (
        <EmptyState title="Nenhum usuário cliente vinculado." description="Adicione um e-mail acima para conceder acesso." />
      ) : (
        <ul className="divide-y">
          {links.map((l: any) => (
            <li key={l.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{l.profiles?.full_name || l.profiles?.email || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {l.profiles?.email}{l.papel ? ` · ${l.papel}` : ""}{!l.ativo ? " · inativo" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggle.mutate(l)} disabled={toggle.isPending}>
                  {l.ativo ? "Desativar" : "Reativar"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(l)} disabled={remove.isPending}>
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Edit Client (admin) ---------- */

function EditClientDialogInline({ client, onDone }: { client: any; onDone: () => void }) {
  const [form, setForm] = useState({
    razao_social: client.razao_social ?? "",
    nome_fantasia: client.nome_fantasia ?? "",
    documento: client.documento ?? "",
    email: client.email ?? "",
    telefone: client.telefone ?? "",
    tipo: client.tipo ?? "comercio",
    data_entrada: client.data_entrada ?? "",
    status: client.status ?? "active",
    observacoes: client.observacoes ?? "",
  });
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("clients")
        .update({
          razao_social: form.razao_social.trim(),
          nome_fantasia: form.nome_fantasia || null,
          documento: form.documento || null,
          email: form.email || null,
          telefone: form.telefone || null,
          tipo: form.tipo || null,
          data_entrada: form.data_entrada || null,
          status: form.status || "active",
          observacoes: form.observacoes || null,
        })
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente atualizado com sucesso."); onDone(); },
    onError: (e: any) => toast.error(
      /row-level security|permission/i.test(e?.message ?? "")
        ? "Você não tem permissão para realizar esta ação."
        : (e?.message ?? "Não foi possível atualizar o cliente."),
    ),
  });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Razão social / Nome *</Label>
          <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} />
        </div>
        <div className="space-y-1.5"><Label>Nome fantasia</Label><Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>CNPJ / CPF</Label><Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>E-mail principal</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Tipo de cliente</Label>
          <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Data de entrada</Label>
          <Input type="date" value={form.data_entrada ?? ""} onChange={(e) => setForm({ ...form, data_entrada: e.target.value })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observações internas</Label>
          <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={!form.razao_social.trim() || mut.isPending}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------- Dados fiscais ---------- */
const REGIMES = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "mei", label: "MEI" },
  { value: "pessoa_fisica", label: "Pessoa Física" },
  { value: "outro", label: "Outro" },
];
const TIPOS_EMPRESA = [
  { value: "me", label: "ME" },
  { value: "epp", label: "EPP" },
  { value: "ltda", label: "LTDA" },
  { value: "slu", label: "SLU" },
  { value: "sa", label: "S/A" },
  { value: "mei", label: "MEI" },
  { value: "pessoa_fisica", label: "Pessoa Física" },
  { value: "outro", label: "Outro" },
];
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function FiscalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 border-l-4 border-secondary pl-2 text-sm font-semibold uppercase tracking-wide text-primary">
        {title}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function FiscalTab({ clientId, canEdit, isAdmin }: { clientId: string; canEdit: boolean; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["client-fiscal", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_fiscal_data")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const empty = {
    regime_tributario: "", tipo_empresa: "", cnae_principal: "", cnaes_secundarios: "",
    inscricao_municipal: "", inscricao_estadual: "", municipio: "", uf: "",
    responsavel_legal: "", socios: "",
    possui_certificado_digital: null as boolean | null,
    validade_certificado_digital: "", prefeitura_sistema: "",
    observacoes_fiscais: "", observacoes_contabeis: "", observacoes_dp: "", observacoes_internas: "",
    omie_cliente_id: "", omie_sync_status: "", omie_sync_error: "",
  };
  const [form, setForm] = useState<any>(empty);
  useEffect(() => {
    if (!data) return;
    setForm({ ...empty, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? (typeof empty[k as keyof typeof empty] === "boolean" ? null : "")])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        client_id: clientId,
        regime_tributario: form.regime_tributario || null,
        tipo_empresa: form.tipo_empresa || null,
        cnae_principal: form.cnae_principal || null,
        cnaes_secundarios: form.cnaes_secundarios || null,
        inscricao_municipal: form.inscricao_municipal || null,
        inscricao_estadual: form.inscricao_estadual || null,
        municipio: form.municipio || null,
        uf: form.uf || null,
        responsavel_legal: form.responsavel_legal || null,
        socios: form.socios || null,
        possui_certificado_digital: form.possui_certificado_digital,
        validade_certificado_digital: form.validade_certificado_digital || null,
        prefeitura_sistema: form.prefeitura_sistema || null,
        observacoes_fiscais: form.observacoes_fiscais || null,
        observacoes_contabeis: form.observacoes_contabeis || null,
        observacoes_dp: form.observacoes_dp || null,
        observacoes_internas: form.observacoes_internas || null,
      };
      if (isAdmin) {
        payload.omie_cliente_id = form.omie_cliente_id || null;
      }
      const { error } = await supabase
        .from("client_fiscal_data")
        .upsert(payload, { onConflict: "client_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados fiscais salvos.");
      qc.invalidateQueries({ queryKey: ["client-fiscal", clientId] });
    },
    onError: (e: any) =>
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para editar os dados fiscais deste cliente."
          : (e?.message ?? "Não foi possível salvar os dados fiscais."),
      ),
  });

  if (isLoading) return <Card className="p-5 text-sm text-muted-foreground">Carregando dados fiscais…</Card>;

  const disabled = !canEdit;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <FiscalSection title="Dados tributários">
        <div className="space-y-1.5">
          <Label>Regime tributário</Label>
          <Select value={form.regime_tributario || undefined} onValueChange={(v) => set("regime_tributario", v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{REGIMES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de empresa</Label>
          <Select value={form.tipo_empresa || undefined} onValueChange={(v) => set("tipo_empresa", v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{TIPOS_EMPRESA.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>CNAE principal</Label>
          <Input value={form.cnae_principal} onChange={(e) => set("cnae_principal", e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>CNAEs secundários</Label>
          <Input value={form.cnaes_secundarios} onChange={(e) => set("cnaes_secundarios", e.target.value)} placeholder="Separe por vírgula" disabled={disabled} />
        </div>
      </FiscalSection>

      <FiscalSection title="Inscrições e localização">
        <div className="space-y-1.5"><Label>Inscrição municipal</Label><Input value={form.inscricao_municipal} onChange={(e) => set("inscricao_municipal", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5"><Label>Inscrição estadual</Label><Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5"><Label>Município de atuação principal</Label><Input value={form.municipio} onChange={(e) => set("municipio", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5">
          <Label>UF</Label>
          <Select value={form.uf || undefined} onValueChange={(v) => set("uf", v)} disabled={disabled}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </FiscalSection>

      <FiscalSection title="Responsáveis">
        <div className="space-y-1.5"><Label>Responsável legal</Label><Input value={form.responsavel_legal} onChange={(e) => set("responsavel_legal", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Sócios / responsáveis</Label><Textarea rows={3} value={form.socios} onChange={(e) => set("socios", e.target.value)} placeholder="Um por linha" disabled={disabled} /></div>
      </FiscalSection>

      <FiscalSection title="Certificado digital">
        <div className="space-y-1.5">
          <Label>Possui certificado digital?</Label>
          <Select
            value={form.possui_certificado_digital === null || form.possui_certificado_digital === undefined ? undefined : String(form.possui_certificado_digital)}
            onValueChange={(v) => set("possui_certificado_digital", v === "true")}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sim</SelectItem>
              <SelectItem value="false">Não</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Validade do certificado</Label><Input type="date" value={form.validade_certificado_digital ?? ""} onChange={(e) => set("validade_certificado_digital", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Prefeitura vinculada / sistema municipal</Label><Input value={form.prefeitura_sistema} onChange={(e) => set("prefeitura_sistema", e.target.value)} disabled={disabled} /></div>
      </FiscalSection>

      <FiscalSection title="Observações internas">
        <div className="space-y-1.5 sm:col-span-2"><Label>Observações fiscais</Label><Textarea rows={3} value={form.observacoes_fiscais} onChange={(e) => set("observacoes_fiscais", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Observações contábeis</Label><Textarea rows={3} value={form.observacoes_contabeis} onChange={(e) => set("observacoes_contabeis", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Observações de departamento pessoal</Label><Textarea rows={3} value={form.observacoes_dp} onChange={(e) => set("observacoes_dp", e.target.value)} disabled={disabled} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Observações internas da equipe</Label><Textarea rows={3} value={form.observacoes_internas} onChange={(e) => set("observacoes_internas", e.target.value)} disabled={disabled} /></div>
      </FiscalSection>

      {isAdmin && (
        <FiscalSection title="Preparação OMIE (não conectado)">
          <div className="space-y-1.5 sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              Campos técnicos de preparação para futura integração com o OMIE. Nenhuma comunicação com o OMIE está ativa.
            </p>
          </div>
          <div className="space-y-1.5"><Label>omie_cliente_id</Label><Input value={form.omie_cliente_id} onChange={(e) => set("omie_cliente_id", e.target.value)} disabled={disabled} /></div>
          <div className="space-y-1.5"><Label>Última sincronização</Label><Input value={data?.omie_last_synced_at ? new Date(data.omie_last_synced_at).toLocaleString("pt-BR") : "—"} disabled /></div>
          <div className="space-y-1.5"><Label>Status sync</Label><Input value={data?.omie_sync_status ?? ""} disabled /></div>
          <div className="space-y-1.5"><Label>Último erro</Label><Input value={data?.omie_sync_error ?? ""} disabled /></div>
        </FiscalSection>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar dados fiscais"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------- Dados comerciais ---------- */
const PERIODICIDADES = [
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
] as const;
const COMERCIAL_STATUSES = [
  { value: "ativo", label: "Ativo" },
  { value: "suspenso", label: "Suspenso" },
  { value: "encerrado", label: "Encerrado" },
] as const;
const TIPOS_CLIENTE = ["B2B", "B2C", "MEI"] as const;

const brl = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

type CommercialRow = {
  id?: string;
  client_id: string;
  tipo_cliente: "B2B" | "B2C" | "MEI";
  plano: string | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  periodicidade: string;
  status_comercial: string;
  data_inicio: string | null;
  data_ultimo_reajuste: string | null;
  proximo_reajuste: string | null;
  observacoes: string | null;
};

function CommercialCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["client-commercial", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_commercial").select("*").eq("client_id", clientId).maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data ?? null) as CommercialRow | null;
    },
  });

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados comerciais</div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" /> {data ? "Editar" : "Preencher"}
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Nenhum dado comercial cadastrado.</p>
      ) : (
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="text-xs uppercase text-muted-foreground">Tipo de cliente</div><div>{data.tipo_cliente}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Plano</div><div>{data.plano || "—"}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Mensalidade</div><div>{brl(data.valor_mensalidade)}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Vencimento</div><div>{data.dia_vencimento ? `dia ${data.dia_vencimento}` : "—"}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Periodicidade</div><div>{PERIODICIDADES.find((p) => p.value === data.periodicidade)?.label ?? data.periodicidade}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Status</div><div>{COMERCIAL_STATUSES.find((s) => s.value === data.status_comercial)?.label ?? data.status_comercial}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Início</div><div>{formatBR(data.data_inicio)}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Próximo reajuste</div><div>{formatBR(data.proximo_reajuste)}</div></div>
          {data.data_ultimo_reajuste && (
            <div><div className="text-xs uppercase text-muted-foreground">Último reajuste</div><div>{formatBR(data.data_ultimo_reajuste)}</div></div>
          )}
          {data.observacoes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="text-xs uppercase text-muted-foreground">Observações comerciais</div>
              <div className="whitespace-pre-wrap">{data.observacoes}</div>
            </div>
          )}
        </div>
      )}
      {canEdit && open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <CommercialDialog
            clientId={clientId}
            current={data ?? null}
            onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["client-commercial", clientId] }); qc.invalidateQueries({ queryKey: ["clients"] }); qc.invalidateQueries({ queryKey: ["client-events", clientId] }); }}
          />
        </Dialog>
      )}
    </Card>
  );
}

function CommercialDialog({ clientId, current, onDone }: { clientId: string; current: CommercialRow | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CommercialRow & { plan_id?: string | null }>(() => (current as any) ?? {
    client_id: clientId,
    tipo_cliente: "B2B",
    plano: "",
    plan_id: null,
    valor_mensalidade: null,
    dia_vencimento: null,
    periodicidade: "mensal",
    status_comercial: "ativo",
    data_inicio: null,
    data_ultimo_reajuste: null,
    proximo_reajuste: null,
    observacoes: "",
  });
  const [valorStr, setValorStr] = useState<string>(current?.valor_mensalidade != null ? String(current.valor_mensalidade).replace(".", ",") : "");
  const set = (patch: Partial<CommercialRow & { plan_id?: string | null }>) => setForm({ ...form, ...patch });
  const originalPlanId = (current as any)?.plan_id ?? null;
  const [pendingPlanChange, setPendingPlanChange] = useState<string | null>(null);

  const plansQ = useQuery({
    queryKey: ["plans-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("plans").select("id, nome, ativo").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as { id: string; nome: string; ativo: boolean }[];
    },
  });

  const saveOther = useMutation({
    mutationFn: async () => {
      const valor = valorStr ? Number(valorStr.replace(/\./g, "").replace(",", ".")) : null;
      if (valorStr && Number.isNaN(valor)) throw new Error("Valor inválido.");
      const payload: any = {
        client_id: clientId,
        tipo_cliente: form.tipo_cliente,
        plano: form.plano || null,
        valor_mensalidade: valor,
        dia_vencimento: form.dia_vencimento || null,
        periodicidade: form.periodicidade,
        status_comercial: form.status_comercial,
        data_inicio: form.data_inicio || null,
        data_ultimo_reajuste: form.data_ultimo_reajuste || null,
        proximo_reajuste: form.proximo_reajuste || null,
        observacoes: form.observacoes || null,
      };
      const { error } = current?.id
        ? await (supabase as any).from("client_commercial").update(payload).eq("id", current.id)
        : await (supabase as any).from("client_commercial").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Dados comerciais salvos."); qc.invalidateQueries({ queryKey: ["client-commercial", clientId] }); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar."),
  });

  const submit = () => {
    const changed = (form.plan_id ?? null) !== (originalPlanId ?? null);
    if (changed && form.plan_id && originalPlanId) {
      setPendingPlanChange(form.plan_id);
      return;
    }
    // Plano vinculado pela 1ª vez ou removido: aplica direto sem modal.
    saveOther.mutate();
  };

  return (
    <>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Dados comerciais</DialogTitle></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tipo de cliente *</Label>
          <Select value={form.tipo_cliente} onValueChange={(v) => set({ tipo_cliente: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS_CLIENTE.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Plano vinculado</Label>
          <Select value={form.plan_id ?? "__none"} onValueChange={(v) => set({ plan_id: v === "__none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Selecione um plano…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Sem plano —</SelectItem>
              {(plansQ.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Nome do plano (texto livre)</Label><Input value={form.plano ?? ""} onChange={(e) => set({ plano: e.target.value })} placeholder="Opcional" /></div>
        <div className="space-y-1.5">
          <Label>Valor da mensalidade (R$)</Label>
          <Input inputMode="decimal" value={valorStr} onChange={(e) => setValorStr(e.target.value)} placeholder="0,00" />
        </div>
        <div className="space-y-1.5">
          <Label>Dia de vencimento</Label>
          <Input type="number" min={1} max={31} value={form.dia_vencimento ?? ""} onChange={(e) => set({ dia_vencimento: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div className="space-y-1.5">
          <Label>Periodicidade</Label>
          <Select value={form.periodicidade} onValueChange={(v) => set({ periodicidade: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODICIDADES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status comercial</Label>
          <Select value={form.status_comercial} onValueChange={(v) => set({ status_comercial: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{COMERCIAL_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Data de início</Label><Input type="date" value={form.data_inicio ?? ""} onChange={(e) => set({ data_inicio: e.target.value || null })} /></div>
        <div className="space-y-1.5"><Label>Último reajuste</Label><Input type="date" value={form.data_ultimo_reajuste ?? ""} onChange={(e) => set({ data_ultimo_reajuste: e.target.value || null })} /></div>
        <div className="space-y-1.5"><Label>Próximo reajuste</Label><Input type="date" value={form.proximo_reajuste ?? ""} onChange={(e) => set({ proximo_reajuste: e.target.value || null })} /></div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Observações comerciais (internas)</Label>
          <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => set({ observacoes: e.target.value })} />
          <p className="text-xs text-muted-foreground">Visível apenas para administradores e colaboradores.</p>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={saveOther.isPending}>{saveOther.isPending ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
    {pendingPlanChange && (
      <PlanChangeConfirmDialog
        clientId={clientId}
        newPlanId={pendingPlanChange}
        onClose={() => setPendingPlanChange(null)}
        onConfirmed={async () => {
          setPendingPlanChange(null);
          await saveOther.mutateAsync();
        }}
      />
    )}
    </>
  );
}

function PlanChangeConfirmDialog({ clientId, newPlanId, onClose, onConfirmed }: {
  clientId: string; newPlanId: string; onClose: () => void; onConfirmed: () => void;
}) {
  const [mode, setMode] = useState<"proxima" | "adicionar_faltantes" | "substituir_pendentes">("proxima");
  const comp = new Date().toISOString().slice(0, 7);
  const previewQ = useQuery({
    queryKey: ["plan-change-preview", clientId, newPlanId, comp],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("preview_plan_change", {
        _client_id: clientId, _new_plan_id: newPlanId, _competencia: comp,
      });
      if (error) throw error;
      return data as { plano_atual_itens: number; plano_novo_itens: number; adicionar: number; substituir: number; preservar: number; competencia: string };
    },
  });
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("apply_plan_change", {
        _client_id: clientId, _new_plan_id: newPlanId, _mode: mode,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Plano alterado."); onConfirmed(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar troca de plano."),
  });
  const p = previewQ.data;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Trocar plano da empresa</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {previewQ.isLoading ? <p className="text-muted-foreground">Calculando impacto…</p> : p && (
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="mb-1 text-xs uppercase text-muted-foreground">Competência {p.competencia}</div>
              <div className="grid grid-cols-2 gap-y-1">
                <span>Plano atual</span><span className="text-right">{p.plano_atual_itens} itens</span>
                <span>Plano novo</span><span className="text-right">{p.plano_novo_itens} itens</span>
                <span className="text-emerald-700">Serão adicionados</span><span className="text-right font-semibold text-emerald-700">{p.adicionar}</span>
                <span className="text-amber-700">Serão substituídos</span><span className="text-right font-semibold text-amber-700">{p.substituir}</span>
                <span className="text-muted-foreground">Preservados</span><span className="text-right">{p.preservar}</span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Como aplicar?</Label>
            {[
              { v: "proxima", t: "Aplicar somente na próxima competência", d: "Nenhum item da competência atual é alterado." },
              { v: "adicionar_faltantes", t: "Adicionar apenas os itens faltantes", d: "Não apaga nada. Não duplica." },
              { v: "substituir_pendentes", t: "Substituir os itens pendentes do plano anterior", d: "Só substitui automáticos pendentes. Nunca apaga concluídos, recebidos, cancelados ou manuais." },
            ].map((o) => (
              <label key={o.v} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 hover:bg-muted/50">
                <input type="radio" className="mt-1" name="mode" checked={mode === o.v} onChange={() => setMode(o.v as any)} />
                <div><div className="font-medium">{o.t}</div><div className="text-xs text-muted-foreground">{o.d}</div></div>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={apply.isPending}>Cancelar</Button>
          <Button onClick={() => apply.mutate()} disabled={apply.isPending || previewQ.isLoading}>
            {apply.isPending ? "Aplicando…" : "Confirmar troca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
