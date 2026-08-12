// FASE S2 — matriz administrativa plano × serviço.
// Reutiliza public.services (catálogo canônico) e public.plans. Não gera checklist,
// não vincula empresas e não cria registros vazios para preencher a grade.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { brl, labelOf } from "@/lib/services-catalog";
import {
  PERIODICIDADE_LIMITE,
  SITUACAO_LABEL,
  TIPO_INCLUSAO,
  effectivePrice,
  limiteLabel,
  normalizeDraft,
  requiresLimite,
  situacaoOf,
  validateRule,
  type PlanServiceRule,
} from "@/lib/plan-services";

type CatalogService = {
  id: string;
  nome: string;
  categoria: string;
  tipo_preco: string;
  unidade_cobranca: string | null;
  valor_referencia: number | null;
  valor_provisorio: boolean;
  status: string;
};

const SERVICE_COLS = "id,nome,categoria,tipo_preco,unidade_cobranca,valor_referencia,valor_provisorio,status";
const RULE_COLS =
  "id,plan_id,service_id,tipo_inclusao,limite_quantidade,unidade_limite,periodicidade_limite,valor_especifico,valor_especifico_provisorio,observacoes,ordem,status";

export function PlanServicesSection({ planId, canEdit, showOperationLink }: { planId: string; canEdit: boolean; showOperationLink?: boolean }) {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"configurados" | "todos">("configurados");
  const [busca, setBusca] = useState("");
  const [editing, setEditing] = useState<{ service: CatalogService; rule: PlanServiceRule | null } | null>(null);

  // Carregamento consolidado (2 consultas, sem N+1 e sem select("*")).
  const q = useQuery({
    queryKey: ["plan-services", planId],
    queryFn: async () => {
      const [servicesRes, rulesRes] = await Promise.all([
        (supabase as any).from("services").select(SERVICE_COLS).order("categoria").order("nome"),
        (supabase as any).from("plan_services").select(RULE_COLS).eq("plan_id", planId),
      ]);
      if (servicesRes.error) throw servicesRes.error;
      if (rulesRes.error) throw rulesRes.error;
      return {
        services: (servicesRes.data ?? []) as CatalogService[],
        rules: (rulesRes.data ?? []) as PlanServiceRule[],
      };
    },
  });

  const rulesByService = useMemo(
    () => new Map((q.data?.rules ?? []).map((r) => [r.service_id, r])),
    [q.data],
  );

  const rows = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return (q.data?.services ?? [])
      .map((s) => ({ service: s, rule: rulesByService.get(s.id) ?? null }))
      .filter((r) => (filtro === "todos" ? true : !!r.rule))
      .filter((r) => !term || r.service.nome.toLowerCase().includes(term))
      .sort((a, b) => (a.rule?.ordem ?? 0) - (b.rule?.ordem ?? 0) || a.service.nome.localeCompare(b.service.nome, "pt-BR"));
  }, [q.data, rulesByService, filtro, busca]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plan-services", planId] });

  const toggleStatus = useMutation({
    mutationFn: async (rule: PlanServiceRule) => {
      const { error } = await (supabase as any)
        .from("plan_services")
        .update({ status: rule.status === "ativo" ? "inativo" : "ativo" })
        .eq("id", rule.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Situação da regra atualizada"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  const configurados = q.data?.rules?.length ?? 0;

  return (
    <div className="ml-9 mt-3 space-y-2 border-l pl-4">
      <div className="flex flex-wrap items-end gap-2">
        <p className="text-sm font-medium">Serviços do plano</p>
        <Badge variant="outline">{configurados} configurados</Badge>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div className="w-56 space-y-1">
            <Label className="text-xs">Pesquisar serviço</Label>
            <Input className="h-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do serviço" />
          </div>
          <div className="w-48 space-y-1">
            <Label className="text-xs">Exibir</Label>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="configurados">Somente configurados</SelectItem>
                <SelectItem value="todos">Todo o catálogo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtro === "configurados"
            ? "Nenhum serviço configurado para este plano. Use “Todo o catálogo” para adicionar uma regra."
            : "Nenhum serviço encontrado."}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map(({ service, rule }) => {
            const sit = situacaoOf(rule);
            const price = effectivePrice(service, rule);
            return (
              <li key={service.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                <span className="font-medium">{service.nome}</span>
                <Badge variant="outline">{service.categoria}</Badge>
                {showOperationLink && rule && (rule.tipo_inclusao === 'incluido' || rule.tipo_inclusao === 'incluido_com_limite') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          <Check className="mr-1 h-3 w-3" /> Gera operação
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        Este serviço gera automaticamente itens no checklist mensal quando incluído no plano.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {rule ? (
                  <Badge variant="secondary">{labelOf(TIPO_INCLUSAO, rule.tipo_inclusao)}</Badge>
                ) : (
                  <Badge className="bg-zinc-100 text-zinc-600">{SITUACAO_LABEL.nao_configurado}</Badge>
                )}
                {rule?.limite_quantidade != null && (
                  <span className="text-xs text-muted-foreground">Limite: {limiteLabel(rule)}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  Catálogo: {service.tipo_preco === "sob_orcamento" ? "Sob orçamento" : brl(service.valor_referencia)}
                </span>
                {rule?.valor_especifico != null && (
                  <span className="text-xs text-muted-foreground">· Plano: {brl(rule.valor_especifico)}</span>
                )}
                {price.provisorio && price.origem !== "sob_orcamento" && (
                  <Badge className="bg-amber-100 text-amber-800">Valor provisório</Badge>
                )}
                {rule && rule.status !== "ativo" && <Badge className="bg-zinc-200 text-zinc-700">Inativa</Badge>}
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant={rule ? "ghost" : "outline"} onClick={() => setEditing({ service, rule })}>
                      {rule ? <Pencil className="h-4 w-4" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> Configurar</>}
                    </Button>
                    {rule && (
                      <Button size="sm" variant="outline" disabled={toggleStatus.isPending} onClick={() => toggleStatus.mutate(rule)}>
                        {rule.status === "ativo" ? "Inativar" : "Reativar"}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        {editing && (
          <RuleDialog
            planId={planId}
            service={editing.service}
            rule={editing.rule}
            onDone={() => { setEditing(null); invalidate(); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function RuleDialog({
  planId, service, rule, onDone,
}: { planId: string; service: CatalogService; rule: PlanServiceRule | null; onDone: () => void }) {
  const [f, setF] = useState({
    tipo_inclusao: rule?.tipo_inclusao ?? "incluido",
    limite_quantidade: rule?.limite_quantidade != null ? String(rule.limite_quantidade) : "",
    unidade_limite: rule?.unidade_limite ?? service.unidade_cobranca ?? "",
    periodicidade_limite: rule?.periodicidade_limite ?? "__none",
    valor_especifico: rule?.valor_especifico != null ? String(rule.valor_especifico) : "",
    valor_especifico_provisorio: rule?.valor_especifico_provisorio ?? true,
    observacoes: rule?.observacoes ?? "",
    ordem: String(rule?.ordem ?? 0),
  });

  const draft = {
    tipo_inclusao: f.tipo_inclusao,
    limite_quantidade: f.limite_quantidade === "" ? null : Number(f.limite_quantidade),
    unidade_limite: f.unidade_limite.trim() || null,
    periodicidade_limite: f.periodicidade_limite === "__none" ? null : f.periodicidade_limite,
    valor_especifico: f.valor_especifico === "" ? null : Number(f.valor_especifico),
    observacoes: f.observacoes || null,
  };
  const errors = validateRule(draft);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...normalizeDraft(draft),
        valor_especifico_provisorio: f.valor_especifico_provisorio,
        ordem: Number(f.ordem) || 0,
      };
      if (rule) {
        const { error } = await (supabase as any).from("plan_services").update(payload).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("plan_services")
          .insert({ ...payload, plan_id: planId, service_id: service.id, status: "ativo" });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(rule ? "Regra atualizada" : "Regra criada"); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{rule ? "Editar regra do plano" : "Configurar serviço no plano"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <p className="text-sm">
          <span className="font-medium">{service.nome}</span>{" "}
          <span className="text-muted-foreground">
            · {service.categoria} · Catálogo: {service.tipo_preco === "sob_orcamento" ? "Sob orçamento" : brl(service.valor_referencia)}
          </span>
        </p>
        <div className="space-y-1.5">
          <Label>Tipo de inclusão</Label>
          <Select value={f.tipo_inclusao} onValueChange={(v) => setF({ ...f, tipo_inclusao: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPO_INCLUSAO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Limite {requiresLimite(f.tipo_inclusao) ? "*" : ""}</Label>
            <Input type="number" min="1" disabled={!requiresLimite(f.tipo_inclusao)}
              value={requiresLimite(f.tipo_inclusao) ? f.limite_quantidade : ""}
              onChange={(e) => setF({ ...f, limite_quantidade: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Unidade do limite</Label>
            <Input placeholder="ex.: nota, banco" value={f.unidade_limite}
              onChange={(e) => setF({ ...f, unidade_limite: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Periodicidade</Label>
            <Select value={f.periodicidade_limite} onValueChange={(v) => setF({ ...f, periodicidade_limite: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Não definida</SelectItem>
                {PERIODICIDADE_LIMITE.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Valor específico deste plano (R$)</Label>
            <Input type="number" step="0.01" placeholder="Deixe vazio para usar o valor do catálogo"
              value={f.valor_especifico} onChange={(e) => setF({ ...f, valor_especifico: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.valor_especifico_provisorio}
            onCheckedChange={(v) => setF({ ...f, valor_especifico_provisorio: !!v })} />
          Valor provisório
        </label>
        <div className="space-y-1.5">
          <Label>Observação administrativa</Label>
          <Textarea rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </div>
        {errors.length > 0 && <p className="text-xs text-destructive">{errors.join(" · ")}</p>}
      </div>
      <DialogFooter>
        <Button disabled={errors.length > 0 || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : rule ? "Salvar" : "Criar regra"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
