import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, PriorityBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Plus, Upload, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  TASK_STATUSES, TASK_PRIORITIES, DOC_TYPES, DOC_STATUSES, INTERACTION_TYPES, labelOf,
} from "@/lib/sc-types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = useParams({ from: "/_authenticated/clientes/$id" });
  const { role, userId } = useCurrentUser();
  const qc = useQueryClient();

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["client-tasks", id],
    queryFn: async () => (await supabase.from("pending_tasks").select("*").eq("client_id", id).order("prazo")).data ?? [],
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["client-docs", id],
    queryFn: async () => (await supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: events = [] } = useQuery({
    queryKey: ["client-events", id],
    queryFn: async () => (await supabase.from("timeline_events").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: inters = [] } = useQuery({
    queryKey: ["client-inter", id],
    queryFn: async () => (await supabase.from("interactions").select("*").eq("client_id", id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: reqs = [] } = useQuery({
    queryKey: ["client-reqs", id],
    queryFn: async () => (await supabase.from("document_requirements").select("*").eq("client_id", id)).data ?? [],
  });

  const { data: collabs = [] } = useQuery({
    queryKey: ["client-collabs", id],
    enabled: role === "admin",
    queryFn: async () => (await supabase.from("client_collaborators").select("collaborator_id, collaborators(nome, email)").eq("client_id", id)).data ?? [],
  });

  if (!client) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div>
      <Link to="/clientes" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para clientes
      </Link>
      <PageHeader
        title={client.razao_social}
        description={client.nome_fantasia ?? ""}
        action={<StatusBadge value={client.status} />}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Documento</div><div className="mt-1 font-mono text-sm">{client.documento ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">E-mail</div><div className="mt-1 text-sm">{client.email ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Telefone</div><div className="mt-1 text-sm">{client.telefone ?? "—"}</div></Card>
        <Card className="p-4"><div className="text-xs uppercase text-muted-foreground">Entrada</div><div className="mt-1 text-sm">{client.data_entrada ? new Date(client.data_entrada).toLocaleDateString("pt-BR") : "—"}</div></Card>
      </div>

      <Tabs defaultValue="pendencias">
        <TabsList>
          <TabsTrigger value="pendencias">Pendências</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="interacoes">Interações</TabsTrigger>
          <TabsTrigger value="requisitos">Requisitos</TabsTrigger>
          {role === "admin" && <TabsTrigger value="equipe">Equipe</TabsTrigger>}
        </TabsList>

        <TabsContent value="pendencias">
          <PendingTab clientId={id} tasks={tasks} canCreate={role === "admin"} canUpdate={role !== "client"} onChange={() => qc.invalidateQueries({ queryKey: ["client-tasks", id] })} />
        </TabsContent>

        <TabsContent value="documentos">
          <DocsTab clientId={id} docs={docs} userId={userId} onChange={() => qc.invalidateQueries({ queryKey: ["client-docs", id] })} />
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="p-5">
            {events.length === 0 ? <EmptyState title="Sem eventos" /> : (
              <ol className="space-y-4">
                {events.map((e) => (
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
            )}
          </Card>
        </TabsContent>

        <TabsContent value="interacoes">
          <InteractionsTab clientId={id} list={inters} canCreate={role !== "client"} onChange={() => qc.invalidateQueries({ queryKey: ["client-inter", id] })} />
        </TabsContent>

        <TabsContent value="requisitos">
          <RequirementsTab clientId={id} list={reqs} canManage={role === "admin"} onChange={() => qc.invalidateQueries({ queryKey: ["client-reqs", id] })} />
        </TabsContent>

        {role === "admin" && (
          <TabsContent value="equipe">
            <TeamTab clientId={id} current={collabs} onChange={() => qc.invalidateQueries({ queryKey: ["client-collabs", id] })} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ---------- Pendências ---------- */
function PendingTab({ clientId, tasks, canCreate, canUpdate, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: "", descricao: "", tipo: "", prazo: "", prioridade: "media", competencia: "" });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pending_tasks").insert({ ...form, client_id: clientId, prazo: form.prazo || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pendência criada"); setOpen(false); onChange(); setForm({ titulo: "", descricao: "", tipo: "", prazo: "", prioridade: "media", competencia: "" }); },
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
                </div>
                {t.descricao && <div className="mt-0.5 text-sm text-muted-foreground">{t.descricao}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.prazo ? `Prazo: ${new Date(t.prazo).toLocaleDateString("pt-BR")}` : "Sem prazo"} {t.competencia ? ` · ${t.competencia}` : ""}
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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const path = `${clientId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("documents").insert({
        client_id: clientId, nome: file.name, tipo, competencia: competencia || null,
        storage_path: path, uploaded_by: userId, status: "recebido",
      });
      if (error) throw error;
      toast.success("Documento enviado");
      onChange();
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function download(path: string, nome: string) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = nome; a.click();
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
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
                <td className="text-right"><Button variant="ghost" size="sm" onClick={() => download(d.storage_path, d.nome)}>Baixar</Button></td>
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

/* ---------- Team ---------- */
function TeamTab({ clientId, current, onChange }: any) {
  const { data: allCollabs = [] } = useQuery({
    queryKey: ["all-collabs-select"],
    queryFn: async () => (await supabase.from("collaborators").select("id, nome, email").eq("status", "active").order("nome")).data ?? [],
  });
  const [cid, setCid] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_collaborators").insert({ client_id: clientId, collaborator_id: cid });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Colaborador vinculado ao cliente."); setCid(""); onChange(); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Você não tem permissão para realizar esta ação." : (e?.message ?? "Não foi possível vincular o colaborador.")),
  });
  const del = useMutation({
    mutationFn: async (collaboratorId: string) => {
      const { error } = await supabase.from("client_collaborators").delete().eq("client_id", clientId).eq("collaborator_id", collaboratorId);
      if (error) throw error;
    },
    onSuccess: () => onChange(),
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Você não tem permissão para realizar esta ação." : (e?.message ?? "Não foi possível remover o vínculo.")),
  });
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex-1"><Label className="text-xs">Vincular colaborador</Label>
          <Select value={cid} onValueChange={setCid}>
            <SelectTrigger><SelectValue placeholder="Selecione um colaborador" /></SelectTrigger>
            <SelectContent>{allCollabs.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.email ? ` — ${c.email}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={!cid || add.isPending}>Vincular</Button>
      </div>
      {current.length === 0 ? <EmptyState title="Nenhum colaborador vinculado." /> : (
        <ul className="divide-y">
          {current.map((c: any) => (
            <li key={c.collaborator_id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{c.collaborators?.nome ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{c.collaborators?.email ?? ""}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => del.mutate(c.collaborator_id)}>Remover</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
