import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AlertTriangle, Eye, EyeOff, Plug } from "lucide-react";

export const Route = createFileRoute("/_authenticated/integracoes/omie")({
  component: OmiePage,
});

const STATUS_OPTIONS = [
  { value: "desativada", label: "Desativada", cls: "bg-muted text-muted-foreground" },
  { value: "aguardando_configuracao", label: "Aguardando configuração", cls: "bg-warning/15 text-warning-foreground" },
  { value: "configurada_nao_conectada", label: "Configurada, não conectada", cls: "bg-info/10 text-info" },
  { value: "erro_configuracao", label: "Erro de configuração", cls: "bg-destructive/10 text-destructive" },
  { value: "conectada_futuramente", label: "Conectada futuramente", cls: "bg-success/10 text-success" },
];

const FREQ_OPTIONS = [
  { value: "manual", label: "Apenas manual" },
  { value: "horaria", label: "A cada hora" },
  { value: "diaria", label: "Diária" },
  { value: "semanal", label: "Semanal" },
];

const FUTURE_MODULES = [
  "Clientes", "Documentos", "Guias", "Contas a receber", "Contas a pagar",
  "Boletos", "PIX", "Anexos", "Fechamento contábil",
];

function OmiePage() {
  const { role, userId } = useCurrentUser();
  const qc = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<any>({
    status: "desativada", app_key: "", app_secret: "", ambiente: "",
    sync_ativa: false, frequencia_sync: "manual",
    responsavel_profile_id: null, observacoes_internas: "",
  });

  const { data: row, isLoading } = useQuery({
    queryKey: ["omie-integration"],
    enabled: role === "admin",
    queryFn: async () => (await supabase.from("omie_integration").select("*").maybeSingle()).data,
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    enabled: role === "admin",
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email").order("full_name")).data ?? [],
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["omie-logs"],
    enabled: role === "admin",
    queryFn: async () => (await supabase.from("omie_integration_logs").select("*").order("occurred_at", { ascending: false }).limit(50)).data ?? [],
  });

  useEffect(() => {
    if (row) setForm({ ...row });
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, responsavel_profile_id: form.responsavel_profile_id || userId };
      if (row?.id) {
        const { error } = await supabase.from("omie_integration").update(payload).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("omie_integration").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["omie-integration"] });
      toast.success("Configuração salva");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  if (role && role !== "admin") {
    return <div className="p-6 text-sm text-muted-foreground">Acesso restrito a administradores.</div>;
  }
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === form.status) ?? STATUS_OPTIONS[0];
  const maskedSecret = form.app_secret ? "•".repeat(Math.min(form.app_secret.length, 12)) : "";

  return (
    <div>
      <PageHeader
        title="Integração OMIE"
        description="Configurações > Integrações > OMIE"
      />

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
        <div>
          <p className="font-medium text-foreground">A integração com OMIE ainda não está ativa.</p>
          <p className="text-muted-foreground">Esta área prepara a Digital SC para uma conexão futura. Nenhuma chamada externa é feita.</p>
        </div>
      </div>

      <Card className="mb-4 p-5">
        <div className="mb-4 flex items-center gap-3">
          <Plug className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg">Status da integração</h2>
          <span className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${statusOpt.cls}`}>{statusOpt.label}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ambiente / descrição</Label>
            <Input value={form.ambiente ?? ""} onChange={(e) => setForm({ ...form, ambiente: e.target.value })} placeholder="Produção, homologação…" />
          </div>
          <div>
            <Label>App Key</Label>
            <Input value={form.app_key ?? ""} onChange={(e) => setForm({ ...form, app_key: e.target.value })} placeholder="Chave fornecida pelo OMIE" />
          </div>
          <div>
            <Label>App Secret</Label>
            <div className="flex gap-2">
              <Input
                type={showSecret ? "text" : "password"}
                value={showSecret ? (form.app_secret ?? "") : maskedSecret}
                onChange={(e) => showSecret && setForm({ ...form, app_secret: e.target.value })}
                placeholder="Segredo do app"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowSecret((s) => !s)} aria-label="Mostrar/ocultar">
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Tratado como dado sensível. Visível apenas para administradores.</p>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={!!form.sync_ativa} onCheckedChange={(v) => setForm({ ...form, sync_ativa: v })} />
            <Label>Sincronização automática (futura)</Label>
          </div>
          <div>
            <Label>Frequência futura</Label>
            <Select value={form.frequencia_sync ?? "manual"} onValueChange={(v) => setForm({ ...form, frequencia_sync: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FREQ_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label>Última sincronização</Label>
            <Input readOnly value={form.ultima_sincronizacao ? new Date(form.ultima_sincronizacao).toLocaleString("pt-BR") : "—"} />
          </div>
          <div>
            <Label>Próxima sincronização</Label>
            <Input readOnly value={form.proxima_sincronizacao ? new Date(form.proxima_sincronizacao).toLocaleString("pt-BR") : "—"} />
          </div>

          <div className="md:col-span-2">
            <Label>Responsável pela configuração</Label>
            <Select value={form.responsavel_profile_id ?? ""} onValueChange={(v) => setForm({ ...form, responsavel_profile_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
              <SelectContent>
                {(profiles as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>Observações internas</Label>
            <Textarea rows={3} value={form.observacoes_internas ?? ""} onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })} />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar configuração</Button>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 font-display text-lg">Módulos futuros previstos</h2>
        <div className="flex flex-wrap gap-2">
          {FUTURE_MODULES.map((m) => (
            <span key={m} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">{m}</span>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-display text-lg">Logs da integração</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum log registrado. Esta área será populada quando a integração estiver ativa.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b"><th className="py-2 pr-3">Data/hora</th><th>Operação</th><th>Módulo</th><th>Status</th><th>Mensagem</th></tr>
            </thead>
            <tbody>
              {(logs as any[]).map((l) => (
                <tr key={l.id} className="border-b">
                  <td className="py-2 pr-3">{new Date(l.occurred_at).toLocaleString("pt-BR")}</td>
                  <td>{l.tipo_operacao ?? "—"}</td>
                  <td>{l.modulo ?? "—"}</td>
                  <td>{l.status ?? "—"}</td>
                  <td className="text-muted-foreground">{l.mensagem ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
