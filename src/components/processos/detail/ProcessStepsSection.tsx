import { Check, RotateCcw } from "lucide-react";
import { ListSkeleton } from "@/components/sc/Skeletons";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { prazoKind, PRAZO_STYLE } from "@/lib/processo-prazo";
import {
  STEP_STATUS_OPTIONS,
  getStepStatusLabel,
  getStepStatusTone,
} from "@/lib/processos-constants";

type UpdateStep = (args: { stepId: string; patch: any; expectedVersion: string | null | undefined }) => void;

export function ProcessStepsSection({
  steps,
  isLoading,
  userId,
  collabs,
  onUpdateStep,
}: {
  steps: any[];
  isLoading: boolean;
  userId: string | null | undefined;
  collabs: any[];
  onUpdateStep: UpdateStep;
}) {
  return (
    <Card className="mt-3 p-2">
      <div className="border-b px-2 py-2 text-sm font-medium">Etapas</div>
      {isLoading ? <ListSkeleton rows={4} />
        : steps.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma etapa.</p>
        : (
          <ul className="divide-y">
            {steps.map((s: any) => {
              const isDone = s.status === "concluida";
              const pk = prazoKind(s.prazo, { status: s.status, concluidaDentroPrazo: s.concluida_dentro_prazo });
              const pkBadge = pk === "sem_prazo" || pk === "no_prazo" ? null : PRAZO_STYLE[pk];
              return (
                <li key={s.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-8 text-xs text-muted-foreground">#{s.ordem}</span>
                    <span className={`font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>{s.nome}</span>
                    <Badge className={getStepStatusTone(s.status, "staff")}>{getStepStatusLabel(s.status, "staff")}</Badge>
                    {pkBadge && <Badge className={pkBadge.cls}>{pkBadge.label}</Badge>}
                    {s.departamento && <Badge variant="outline">{s.departamento}</Badge>}
                    {s.obrigatoria && <Badge variant="secondary">Obrigatória</Badge>}
                    {s.exige_documento && <Badge className="bg-amber-100 text-amber-800">Exige doc.</Badge>}
                    {s.visivel_cliente && <Badge className="bg-blue-100 text-blue-800">Visível ao cliente</Badge>}
                    {s.responsavel?.full_name && <span className="text-xs text-muted-foreground">· {s.responsavel.full_name}</span>}
                    {s.prazo && <span className="text-xs text-muted-foreground">· prazo {new Date(s.prazo).toLocaleDateString("pt-BR")}</span>}
                    <div className="ml-auto flex items-center gap-1">
                      {!isDone ? (
                        <Button size="sm" variant="outline" disabled={!s.pode_concluir_manual}
                          onClick={() => onUpdateStep({ stepId: s.id, patch: { status: "concluida", data_conclusao: new Date().toISOString(), concluida_por: userId }, expectedVersion: s.updated_at })}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Concluir
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost"
                          onClick={() => onUpdateStep({ stepId: s.id, patch: { status: "pendente", data_conclusao: null, concluida_por: null }, expectedVersion: s.updated_at })}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <div>
                      <Label className="text-[10px] uppercase">Status</Label>
                      <Select value={s.status} onValueChange={(v) =>
                        onUpdateStep({ stepId: s.id, patch: {
                          status: v,
                          data_conclusao: v === "concluida" ? new Date().toISOString() : null,
                          concluida_por: v === "concluida" ? userId : null,
                        }, expectedVersion: s.updated_at })
                      }>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STEP_STATUS_OPTIONS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Responsável</Label>
                      <Select value={s.responsavel_id ?? "__none__"} onValueChange={(v) =>
                        onUpdateStep({ stepId: s.id, patch: { responsavel_id: v === "__none__" ? null : v }, expectedVersion: s.updated_at })
                      }>
                        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Nenhum —</SelectItem>
                          {collabs.map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Prazo</Label>
                      <Input key={`step-prazo:${s.id}:${s.updated_at}`} className="h-8" type="date" defaultValue={s.prazo ?? ""}
                        onBlur={(e) => { const v = e.target.value || null; if (v !== s.prazo) onUpdateStep({ stepId: s.id, patch: { prazo: v }, expectedVersion: s.updated_at }); }} />
                    </div>
                    <div className="sm:col-span-4">
                      <Label className="text-[10px] uppercase">Observações</Label>
                      <Textarea key={`step-obs:${s.id}:${s.updated_at}`} rows={2} defaultValue={s.observacoes ?? ""}
                        onBlur={(e) => { if (e.target.value !== (s.observacoes ?? "")) onUpdateStep({ stepId: s.id, patch: { observacoes: e.target.value || null }, expectedVersion: s.updated_at }); }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </Card>
  );
}
