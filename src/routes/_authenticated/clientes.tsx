import { createFileRoute, Link } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { useMemo, useState } from "react";
import { Plus, Search, Users, Pencil, PowerOff, Power } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { adminSetClientStatus } from "@/lib/admin-users.functions";

import { useCurrentUser } from "@/hooks/use-current-user";
import { CLIENT_TYPES, labelOf } from "@/lib/sc-types";
import { CnpjLookup } from "@/components/sc/CnpjLookup";
import { mapReceitaToForm } from "@/lib/receita-map";
import { AccountLookup, type AccountMatch } from "@/components/sc/AccountLookup";
import { MultiSelect } from "@/components/sc/MultiSelect";
import { AlertTriangle, UserCog } from "lucide-react";


export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientsPage,
});

function ClientsPage() {
  const { role } = useCurrentUser();
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState<string>("active");
  const [fTipo, setFTipo] = useState<string>("all");
  const [fRegime, setFRegime] = useState<string>("all");
  const [fUf, setFUf] = useState<string>("all");
  const [fResp, setFResp] = useState<string>("all");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);


  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, client_fiscal_data(regime_tributario, uf, municipio), client_collaborators(collaborator_id, collaborators(id, nome)), client_users(id, ativo)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ["clients-collabs-options"],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("collaborators").select("id, nome").eq("status", "active").order("nome")).data ?? [],
  });

  const regimeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients as any[]) {
      const r = c.client_fiscal_data?.regime_tributario;
      if (r) s.add(r);
    }
    return Array.from(s).sort();
  }, [clients]);
  const ufOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of clients as any[]) {
      const u = c.client_fiscal_data?.uf;
      if (u) s.add(u);
    }
    return Array.from(s).sort();
  }, [clients]);

  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = (clients as any[]).filter((c) => {
    if (q && ![c.razao_social, c.nome_fantasia, c.documento, c.email].join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    if (fStatus !== "all" && c.status !== fStatus) return false;
    if (fTipo !== "all" && c.tipo !== fTipo) return false;
    if (fRegime !== "all" && (c.client_fiscal_data?.regime_tributario ?? "") !== fRegime) return false;
    if (fUf !== "all" && (c.client_fiscal_data?.uf ?? "") !== fUf) return false;
    if (fResp !== "all") {
      const ids = (c.client_collaborators ?? []).map((cc: any) => cc.collaborator_id);
      if (!ids.includes(fResp)) return false;
    }
    if (!inRange(c.data_entrada ?? c.created_at, range)) return false;
    return true;
  });
  const clearFilters = () => {
    setQ(""); setFStatus("active"); setFTipo("all"); setFRegime("all"); setFUf("all"); setFResp("all"); setDateF(EMPTY_DATE_FILTER);
  };

  return (
    <div>
      <PageHeader
        title={role === "admin" ? "Clientes" : "Meus clientes"}
        description={role === "admin" ? "Cadastro e gestão de todos os clientes." : "Clientes vinculados ao seu atendimento."}
        action={
          role === "admin" && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Novo cliente</Button>
              </DialogTrigger>
              <NewClientDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clients"] }); }} />
            </Dialog>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Razão social, CNPJ, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {regimeOptions.length > 0 && (
            <div>
              <Label className="text-xs">Regime tributário</Label>
              <Select value={fRegime} onValueChange={setFRegime}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {regimeOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {ufOptions.length > 0 && (
            <div>
              <Label className="text-xs">UF</Label>
              <Select value={fUf} onValueChange={setFUf}>
                <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {ufOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {isAdmin && (collaborators as any[]).length > 0 && (
            <div>
              <Label className="text-xs">Responsável</Label>
              <Select value={fResp} onValueChange={setFResp}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(collaborators as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <DateRangeFilter value={dateF} onChange={setDateF} label="Data de entrada" />
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
      </Card>

      <Card className="p-4">


        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="Nenhum cliente encontrado"
            description={role === "admin" ? "Crie o primeiro cliente para começar." : "Nenhum cliente vinculado a você."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Entrada</th>
                  <th className="py-2 pr-4">Status</th>
                  {role === "admin" && <th className="w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/40">
                    <td className="py-3 pr-4">
                      <Link to="/clientes/$id" params={{ id: c.id }} className="font-medium text-primary hover:underline">
                        {c.razao_social}
                      </Link>
                      {c.nome_fantasia && <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>}
                      {role === "admin" && !((c.client_users ?? []) as any[]).some((u: any) => u.ativo) && (
                        <Link
                          to="/clientes/$id"
                          params={{ id: c.id }}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                          title="Vincule uma conta de acesso na aba Acessos"
                        >
                          <AlertTriangle className="h-3 w-3" /> Empresa sem conta vinculada
                        </Link>
                      )}
                      {role === "admin" && ((c.client_collaborators ?? []) as any[]).length === 0 && (
                        <Link
                          to="/clientes/$id"
                          params={{ id: c.id }}
                          className="mt-1 ml-1 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                          title="Vincule um colaborador encarregado na aba Equipe"
                        >
                          <UserCog className="h-3 w-3" /> Empresa sem colaborador encarregado
                        </Link>
                      )}

                    </td>
                    <td className="py-3 pr-4">{labelOf(CLIENT_TYPES, c.tipo)}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{c.documento ?? "—"}</td>
                    <td className="py-3 pr-4">{formatBR(c.data_entrada)}</td>
                    <td className="py-3 pr-4"><StatusBadge value={c.status} /></td>
                    {role === "admin" && (
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <InactivateClientButton client={c} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
          <EditClientDialog
            client={editing}
            onDone={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["clients"] });
            }}
          />
        </Dialog>
      )}

    </div>
  );
}

type ReceitaFormShape = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  tipo: string;
  data_entrada?: string;
  status?: string;
  observacoes: string;
  situacao_cadastral: string;
  data_abertura: string;
  cnae_principal_codigo: string;
  cnae_principal_descricao: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  porte: string;
  natureza_juridica: string;
  capital_social: string;
  simples_nacional: boolean | null;
  mei: boolean | null;
  qsa_json: any[];
  dados_receita_json: any;
  ultima_consulta_receita: string | null;
};

function ReceitaFields({
  form,
  setForm,
}: {
  form: ReceitaFormShape;
  setForm: (f: ReceitaFormShape) => void;
}) {
  const set = (patch: Partial<ReceitaFormShape>) => setForm({ ...form, ...patch });
  const ativo = (form.situacao_cadastral ?? "").toUpperCase() === "ATIVA";
  return (
    <>
      {form.situacao_cadastral && !ativo && (
        <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Atenção: este CNPJ está com situação cadastral diferente de ATIVA ({form.situacao_cadastral}).
        </div>
      )}
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Razão social *</Label>
        <Input value={form.razao_social} onChange={(e) => set({ razao_social: e.target.value })} required />
      </div>
      <div className="space-y-1.5"><Label>Nome fantasia</Label><Input value={form.nome_fantasia} onChange={(e) => set({ nome_fantasia: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Situação cadastral</Label><Input value={form.situacao_cadastral} onChange={(e) => set({ situacao_cadastral: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Data de abertura</Label><Input type="date" value={form.data_abertura ?? ""} onChange={(e) => set({ data_abertura: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Porte</Label><Input value={form.porte} onChange={(e) => set({ porte: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>CNAE principal</Label><Input value={form.cnae_principal_codigo} onChange={(e) => set({ cnae_principal_codigo: e.target.value })} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>CNAE descrição</Label><Input value={form.cnae_principal_descricao} onChange={(e) => set({ cnae_principal_descricao: e.target.value })} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Natureza jurídica</Label><Input value={form.natureza_juridica} onChange={(e) => set({ natureza_juridica: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Capital social (R$)</Label><Input inputMode="decimal" value={form.capital_social} onChange={(e) => set({ capital_social: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>CEP</Label><Input value={form.cep} onChange={(e) => set({ cep: e.target.value })} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => set({ logradouro: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Número</Label><Input value={form.numero} onChange={(e) => set({ numero: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => set({ complemento: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => set({ bairro: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => set({ cidade: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>UF</Label><Input maxLength={2} value={form.uf} onChange={(e) => set({ uf: e.target.value.toUpperCase() })} /></div>
      <div className="space-y-1.5"><Label>Simples Nacional</Label>
        <Select value={form.simples_nacional == null ? "null" : form.simples_nacional ? "true" : "false"} onValueChange={(v) => set({ simples_nacional: v === "null" ? null : v === "true" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="null">Não informado</SelectItem>
            <SelectItem value="true">Optante</SelectItem>
            <SelectItem value="false">Não optante</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>MEI</Label>
        <Select value={form.mei == null ? "null" : form.mei ? "true" : "false"} onValueChange={(v) => set({ mei: v === "null" ? null : v === "true" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="null">Não informado</SelectItem>
            <SelectItem value="true">Sim</SelectItem>
            <SelectItem value="false">Não</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {Array.isArray(form.qsa_json) && form.qsa_json.length > 0 && (
        <div className="sm:col-span-2 space-y-1.5">
          <Label>Quadro societário</Label>
          <div className="rounded-md border bg-muted/30 p-2 text-xs">
            <ul className="space-y-1">
              {form.qsa_json.map((s: any, i: number) => (
                <li key={i}>
                  <span className="font-medium">{s.nome_socio ?? s.nome ?? "Sócio"}</span>
                  {s.qualificacao_socio ? ` — ${s.qualificacao_socio}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {form.ultima_consulta_receita && (
        <div className="sm:col-span-2 text-xs text-muted-foreground">
          Última consulta à Receita: {new Date(form.ultima_consulta_receita).toLocaleString("pt-BR")}
        </div>
      )}
    </>
  );
}

async function findDuplicateCnpj(cnpjDigits: string, excludeId?: string) {
  if (!cnpjDigits || cnpjDigits.length !== 14) return null;
  let q = supabase.from("clients").select("id, razao_social, nome_fantasia").or(`cnpj.eq.${cnpjDigits},documento.eq.${cnpjDigits}`).limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return data && data.length > 0 ? data[0] : null;
}

async function ensureNoDuplicateCnpj(cnpjDigits: string, excludeId?: string): Promise<boolean> {
  const dup = await findDuplicateCnpj(cnpjDigits, excludeId);
  if (dup) {
    toast.error("Este CNPJ já está cadastrado.");
    return false;
  }
  return true;
}

function buildClientPayload(form: ReceitaFormShape, cnpjDigits: string) {
  return {
    razao_social: form.razao_social.trim(),
    nome_fantasia: form.nome_fantasia || null,
    cnpj: cnpjDigits || null,
    documento: cnpjDigits || null,
    email: form.email || null,
    telefone: form.telefone || null,
    tipo: form.tipo || null,
    observacoes: form.observacoes || null,
    situacao_cadastral: form.situacao_cadastral || null,
    data_abertura: form.data_abertura || null,
    cnae_principal_codigo: form.cnae_principal_codigo || null,
    cnae_principal_descricao: form.cnae_principal_descricao || null,
    cep: form.cep || null,
    logradouro: form.logradouro || null,
    numero: form.numero || null,
    complemento: form.complemento || null,
    bairro: form.bairro || null,
    cidade: form.cidade || null,
    uf: form.uf || null,
    porte: form.porte || null,
    natureza_juridica: form.natureza_juridica || null,
    capital_social: form.capital_social ? Number(String(form.capital_social).replace(",", ".")) : null,
    simples_nacional: form.simples_nacional,
    mei: form.mei,
    qsa_json: form.qsa_json && form.qsa_json.length ? form.qsa_json : null,
    dados_receita_json: form.dados_receita_json || null,
    ultima_consulta_receita: form.ultima_consulta_receita || null,
  } as any;
}

function NewClientDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState<ReceitaFormShape>({
    cnpj: "", razao_social: "", nome_fantasia: "", email: "", telefone: "",
    tipo: "comercio", observacoes: "",
    situacao_cadastral: "", data_abertura: "",
    cnae_principal_codigo: "", cnae_principal_descricao: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
    porte: "", natureza_juridica: "", capital_social: "",
    simples_nacional: null, mei: null, qsa_json: [], dados_receita_json: null,
    ultima_consulta_receita: null,
  });
  const [account, setAccount] = useState<AccountMatch | null>(null);
  const [collabIds, setCollabIds] = useState<string[]>([]);
  const [existing, setExisting] = useState<{ id: string; razao_social: string | null; nome_fantasia: string | null } | null>(null);

  const { data: allCollaborators = [] } = useQuery({
    queryKey: ["new-client-collab-options"],
    queryFn: async () =>
      (await supabase.from("collaborators").select("id, nome, email").eq("status", "active").order("nome")).data ?? [],
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Vincule uma conta de acesso existente antes de salvar.");
      if (collabIds.length === 0) throw new Error("Selecione pelo menos um colaborador encarregado.");
      const ok = await ensureNoDuplicateCnpj(form.cnpj);
      if (!ok) throw new Error("__dup__");
      const payload = { ...buildClientPayload(form, form.cnpj), origem_cadastro: "manual" };
      const { error } = await supabase.rpc("admin_create_client_with_user", {
        _payload: payload as any,
        _user_id: account.id,
        _papel: "responsavel",
        _collaborator_ids: collabIds,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente criado e vinculado à conta"); onDone(); },
    onError: (e: any) => { if (e?.message !== "__dup__") toast.error(e.message); },
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Novo cliente</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Contas e responsáveis</h3>
          <AccountLookup value={account} onChange={setAccount} />

          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <Label className="text-sm font-semibold">
              Colaboradores encarregados <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Selecione um ou mais colaboradores responsáveis por esta empresa. Apenas eles terão acesso à comunicação, documentos e pendências do cliente.
            </p>
            <MultiSelect
              options={(allCollaborators as any[]).map((c) => ({ value: c.id, label: c.nome, hint: c.email }))}
              value={collabIds}
              onChange={setCollabIds}
              placeholder="Buscar colaborador por nome ou e-mail…"
              emptyMessage="Nenhum colaborador ativo cadastrado."
              noneSelectedMessage="Nenhum colaborador selecionado ainda."
            />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Preencher por CNPJ</h3>
          <CnpjLookup
            value={form.cnpj}
            onChange={(v) => { setForm({ ...form, cnpj: v }); if (existing) setExisting(null); }}
            onResult={async (r) => {
              const m = mapReceitaToForm(r);
              setForm({ ...form, ...m, ultima_consulta_receita: new Date().toISOString() });
              const dup = await findDuplicateCnpj(form.cnpj);
              setExisting(dup);
            }}
          />
          {existing && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>Este CNPJ já está cadastrado{existing.razao_social ? ` como "${existing.razao_social}"` : ""}.</span>
              <Link
                to="/clientes/$id"
                params={{ id: existing.id }}
                className="font-medium text-primary hover:underline"
              >
                Abrir cadastro existente
              </Link>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Demais informações</h3>
          <p className="text-xs text-muted-foreground">
            Revise os dados encontrados e complete o que faltar manualmente antes de salvar.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReceitaFields form={form} setForm={setForm} />
            <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações internas</Label>
              <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button
          onClick={() => mut.mutate()}
          disabled={!form.razao_social || mut.isPending || !!existing || !account || collabIds.length === 0}
        >
          {mut.isPending
            ? "Salvando…"
            : !account
              ? "Vincule uma conta para salvar"
              : collabIds.length === 0
                ? "Selecione ao menos um colaborador"
                : "Criar cliente"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


export function EditClientDialog({ client, onDone }: { client: any; onDone: () => void }) {
  const initialCnpj = String(client.cnpj ?? client.documento ?? "").replace(/\D/g, "");
  const [form, setForm] = useState<ReceitaFormShape>({
    cnpj: initialCnpj,
    razao_social: client.razao_social ?? "",
    nome_fantasia: client.nome_fantasia ?? "",
    email: client.email ?? "",
    telefone: client.telefone ?? "",
    tipo: client.tipo ?? "comercio",
    data_entrada: client.data_entrada ?? "",
    status: client.status ?? "active",
    observacoes: client.observacoes ?? "",
    situacao_cadastral: client.situacao_cadastral ?? "",
    data_abertura: client.data_abertura ?? "",
    cnae_principal_codigo: client.cnae_principal_codigo ?? "",
    cnae_principal_descricao: client.cnae_principal_descricao ?? "",
    cep: client.cep ?? "",
    logradouro: client.logradouro ?? "",
    numero: client.numero ?? "",
    complemento: client.complemento ?? "",
    bairro: client.bairro ?? "",
    cidade: client.cidade ?? "",
    uf: client.uf ?? "",
    porte: client.porte ?? "",
    natureza_juridica: client.natureza_juridica ?? "",
    capital_social: client.capital_social != null ? String(client.capital_social) : "",
    simples_nacional: client.simples_nacional ?? null,
    mei: client.mei ?? null,
    qsa_json: Array.isArray(client.qsa_json) ? client.qsa_json : [],
    dados_receita_json: client.dados_receita_json ?? null,
    ultima_consulta_receita: client.ultima_consulta_receita ?? null,
  });
  const mut = useMutation({
    mutationFn: async () => {
      const ok = await ensureNoDuplicateCnpj(form.cnpj, client.id);
      if (!ok) throw new Error("__dup__");
      const payload = {
        ...buildClientPayload(form, form.cnpj),
        data_entrada: form.data_entrada || null,
        status: form.status || "active",
      };
      const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cliente atualizado com sucesso."); onDone(); },
    onError: (e: any) => {
      if (e?.message === "__dup__") return;
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para realizar esta ação."
          : (e?.message ?? "Não foi possível atualizar o cliente."),
      );
    },
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Editar cliente</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Atualizar dados por CNPJ</h3>
          <CnpjLookup
            value={form.cnpj}
            onChange={(v) => setForm({ ...form, cnpj: v })}
            buttonLabel="Atualizar dados pelo CNPJ"
            helperText="Consulte novamente a Minha Receita para atualizar os campos públicos. Nada é salvo até você clicar em Salvar alterações."
            onResult={(r) => {
              const m = mapReceitaToForm(r);
              setForm({ ...form, ...m, ultima_consulta_receita: new Date().toISOString() });
            }}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Dados do cliente</h3>
          <div className="grid gap-4 sm:grid-cols-2">
        <ReceitaFields form={form} setForm={setForm} />
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
        </section>
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={!form.razao_social.trim() || mut.isPending}>
          {mut.isPending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function InactivateClientButton({ client }: { client: any }) {
  const qc = useQueryClient();
  const setStatusFn = useServerFn(adminSetClientStatus);
  const isInactive = client.status === "inactive";
  const mut = useMutation({
    mutationFn: () =>
      setStatusFn({
        data: { client_id: client.id, status: isInactive ? "active" : "inactive" },
      }),
    onSuccess: () => {
      toast.success(isInactive ? "Cliente reativado." : "Cliente removido com sucesso.");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) =>
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para realizar esta ação."
          : (e?.message ?? "Não foi possível atualizar o cliente."),
      ),
  });

  if (isInactive) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Reativar cliente"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
      >
        <Power className="h-4 w-4 text-green-600" />
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Remover cliente">
          <PowerOff className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover este cliente? Ele será marcado como inativo
            e deixará de aparecer para os colaboradores. O histórico, documentos,
            pendências e vínculos serão preservados e poderão ser restaurados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()}>Remover cliente</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
