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
import { Plus, Search, Building2, Pencil, PowerOff, Power, Trash2 } from "lucide-react";
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
        .is("deleted_at", null)
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
        title={role === "admin" ? "Empresas cadastradas" : "Minhas empresas"}
        description={role === "admin" ? "Cadastro e gestão de todas as empresas." : "Empresas vinculadas ao seu atendimento."}
        action={
          role === "admin" && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Nova empresa</Button>
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
            icon={<Building2 className="h-6 w-6" />}
            title="Nenhuma empresa encontrada"
            description={role === "admin" ? "Cadastre a primeira empresa para começar." : "Nenhuma empresa vinculada a você."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Empresa</th>
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
                          <Button variant="ghost" size="icon" aria-label="Editar empresa" onClick={() => setEditing(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <InactivateClientButton client={c} />
                          <DeleteClientButton client={c} />
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
    onSuccess: () => { toast.success("Empresa cadastrada com sucesso."); onDone(); },
    onError: (e: any) => { if (e?.message !== "__dup__") toast.error(e.message); },
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nova empresa</DialogTitle>
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
                : "Cadastrar empresa"}
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
    onSuccess: () => { toast.success("Dados da empresa atualizados."); onDone(); },
    onError: (e: any) => {
      if (e?.message === "__dup__") return;
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para realizar esta ação."
          : (e?.message ?? "Não foi possível atualizar a empresa."),
      );
    },
  });

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Editar empresa</DialogTitle></DialogHeader>
      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados da empresa</TabsTrigger>
          <TabsTrigger value="contas">Contas vinculadas</TabsTrigger>
          <TabsTrigger value="colabs">Colaboradores encarregados</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Atualizar dados por CNPJ</h3>
              <CnpjLookup
                value={form.cnpj}
                onChange={(v) => setForm({ ...form, cnpj: v })}
                buttonLabel="Atualizar dados pelo CNPJ"
                helperText="Consulte novamente a Minha Receita. Nada é salvo até você clicar em Salvar alterações."
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
          <DialogFooter className="mt-4">
            <Button onClick={() => mut.mutate()} disabled={!form.razao_social.trim() || mut.isPending}>
              {mut.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </TabsContent>

        <TabsContent value="contas">
          <ClientUsersInlineManager clientId={client.id} />
        </TabsContent>

        <TabsContent value="colabs">
          <ClientCollabsInlineManager clientId={client.id} />
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

/* ---------- Inline managers reused by EditClientDialog ---------- */

function ClientUsersInlineManager({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: links = [], isLoading, error: loadError } = useQuery({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("client_users")
        .select("id, user_id, papel, ativo, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
      const profilesMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, full_name, email").in("id", ids);
        (profs ?? []).forEach((p: any) => profilesMap.set(p.id, { full_name: p.full_name, email: p.email }));
      }
      return (rows ?? []).map((r: any) => ({ ...r, profiles: profilesMap.get(r.user_id) ?? null }));
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
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", prof.id);
      const hasClientRole = (roles ?? []).some((r: any) => r.role === "client");
      if (!hasClientRole) throw new Error("Esta conta existe, mas não possui perfil de cliente.");
      const { data: existing } = await supabase
        .from("client_users").select("id, ativo")
        .eq("client_id", clientId).eq("user_id", prof.id).maybeSingle();
      if (existing) {
        if (existing.ativo) throw new Error("Este usuário já está vinculado a esta empresa.");
        const { error: uErr } = await supabase
          .from("client_users").update({ ativo: true, papel }).eq("id", existing.id);
        if (uErr) throw uErr;
        return { reactivated: true };
      }
      const { error } = await supabase
        .from("client_users")
        .insert({ client_id: clientId, user_id: prof.id, papel, ativo: true });
      if (error) {
        if (error.code === "23505") throw new Error("Este usuário já está vinculado a esta empresa.");
        throw error;
      }
      return { reactivated: false };
    },
    onSuccess: (res: any) => {
      toast.success(res?.reactivated ? "Este usuário já estava vinculado e foi reativado." : "Usuário vinculado.");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["client-users", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao vincular."),
  });
  const toggle = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from("client_users").update({ ativo: !row.ativo }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado."); qc.invalidateQueries({ queryKey: ["client-users", clientId] }); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar."),
  });
  const remove = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from("client_users").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Vínculo removido."); qc.invalidateQueries({ queryKey: ["client-users", clientId] }); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover."),
  });

  const activeCount = (links as any[]).filter((l) => l.ativo).length;

  return (
    <div className="space-y-3 py-2">
      {activeCount === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Empresa sem conta cliente ativa vinculada. Vincule pelo menos uma conta para liberar a comunicação.</div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Uma mesma conta cliente pode estar vinculada a várias empresas. A conta precisa existir em Configurações antes de ser vinculada aqui.
      </p>
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">E-mail da conta cliente</Label>
          <Input type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Papel</Label>
          <Select value={papel} onValueChange={setPapel}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
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
          {add.isPending ? "Vinculando…" : "Vincular"}
        </Button>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">Falha ao carregar vínculos: {(loadError as any)?.message}</p>
      ) : isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (links as any[]).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma conta cliente vinculada.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(links as any[]).map((l) => (
            <li key={l.id} className="flex items-center justify-between px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{l.profiles?.full_name || l.profiles?.email || "—"}</div>
                <div className="text-xs text-muted-foreground">{l.profiles?.email}{l.papel ? ` · ${l.papel}` : ""}{!l.ativo ? " · inativo" : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggle.mutate(l)} disabled={toggle.isPending}>
                  {l.ativo ? "Desativar" : "Reativar"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm">Remover</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover vínculo?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A conta {l.profiles?.email ?? ""} deixará de acessar esta empresa.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove.mutate(l)}>Remover</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientCollabsInlineManager({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: current = [] } = useQuery({
    queryKey: ["client-collabs", clientId],
    queryFn: async () => (await supabase.from("client_collaborators").select("collaborator_id, collaborators(nome, email)").eq("client_id", clientId)).data ?? [],
  });
  const { data: allCollabs = [] } = useQuery({
    queryKey: ["all-collabs-select"],
    queryFn: async () => (await supabase.from("collaborators").select("id, nome, email").eq("status", "active").order("nome")).data ?? [],
  });
  const [cid, setCid] = useState("");
  const [search, setSearch] = useState("");
  const linkedIds = new Set((current as any[]).map((c) => c.collaborator_id));
  const available = (allCollabs as any[]).filter((c) => {
    if (linkedIds.has(c.id)) return false;
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (c.nome ?? "").toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s);
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("client_collaborators").insert({ client_id: clientId, collaborator_id: cid });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Colaborador vinculado."); setCid(""); setSearch(""); qc.invalidateQueries({ queryKey: ["client-collabs", clientId] }); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: any) => { if (e?.code === "23505") return toast.error("Já vinculado."); toast.error(e?.message ?? "Falha"); },
  });
  const del = useMutation({
    mutationFn: async (collaboratorId: string) => {
      const { error } = await supabase.from("client_collaborators").delete().eq("client_id", clientId).eq("collaborator_id", collaboratorId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido."); qc.invalidateQueries({ queryKey: ["client-collabs", clientId] }); qc.invalidateQueries({ queryKey: ["clients"] }); },
  });

  const isEmpty = (current as any[]).length === 0;
  return (
    <div className="space-y-3 py-2">
      {isEmpty && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Empresa sem colaborador responsável. Vincule pelo menos um para liberar a comunicação interna.</div>
        </div>
      )}
      <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label className="text-xs">Buscar colaborador</Label>
          <Input placeholder="Nome ou e-mail…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Selecionar</Label>
          <Select value={cid} onValueChange={setCid}>
            <SelectTrigger><SelectValue placeholder={available.length === 0 ? "Nenhum disponível" : "Selecione"} /></SelectTrigger>
            <SelectContent>
              {available.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}{c.email ? ` — ${c.email}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => add.mutate()} disabled={!cid || add.isPending}>
          {add.isPending ? "…" : "Vincular"}
        </Button>
      </div>
      {isEmpty ? <p className="text-sm text-muted-foreground">Nenhum colaborador vinculado.</p> : (
        <ul className="divide-y rounded-md border">
          {(current as any[]).map((c) => (
            <li key={c.collaborator_id} className="flex items-center justify-between px-3 py-2">
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
                      {c.collaborators?.nome ?? "Este colaborador"} deixará de acessar esta empresa.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del.mutate(c.collaborator_id)}>Remover</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      toast.success(isInactive ? "Empresa reativada." : "Empresa desativada com sucesso.");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) =>
      toast.error(
        /row-level security|permission/i.test(e?.message ?? "")
          ? "Você não tem permissão para realizar esta ação."
          : (e?.message ?? "Não foi possível atualizar a empresa."),
      ),
  });

  if (isInactive) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Reativar empresa"
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
        <Button variant="ghost" size="icon" aria-label="Desativar empresa">
          <PowerOff className="h-4 w-4 text-amber-600" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desativar empresa</AlertDialogTitle>
          <AlertDialogDescription>
            A empresa será marcada como inativa e deixará de aparecer para os colaboradores.
            O histórico, documentos, pendências e vínculos serão preservados e poderão ser restaurados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()}>Desativar empresa</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteClientButton({ client }: { client: any }) {
  const qc = useQueryClient();
  const expected = (client.razao_social ?? client.nome_fantasia ?? "").trim();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_soft_delete_client" as any, { _client_id: client.id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa excluída. Histórico preservado para auditoria.");
      setOpen(false);
      setConfirmText("");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: any) =>
      toast.error(
        /row-level security|permission|administradores/i.test(e?.message ?? "")
          ? "Apenas administradores podem excluir empresas."
          : (e?.message ?? "Não foi possível excluir a empresa."),
      ),
  });

  const canConfirm = confirmText.trim().toLowerCase() === expected.toLowerCase() && expected.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmText(""); }}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Excluir empresa">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir empresa</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir esta empresa? Esta ação pode remover ou afetar
            vínculos, documentos, solicitações, chats, pendências e histórico relacionados a ela.
            O histórico não será apagado, mas a empresa deixará de aparecer para clientes e colaboradores.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">
            Para confirmar, digite o nome da empresa: <span className="font-semibold">{expected}</span>
          </Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expected}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || mut.isPending}
            onClick={(e) => { e.preventDefault(); if (canConfirm) mut.mutate(); }}
          >
            {mut.isPending ? "Excluindo…" : "Excluir empresa"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
