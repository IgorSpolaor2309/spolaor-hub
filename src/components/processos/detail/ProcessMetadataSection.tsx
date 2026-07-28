import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PROCESS_STATUS_OPTIONS,
  PROCESS_PRIORITY_OPTIONS,
  getProcessStatusLabel,
  getProcessStatusTone,
} from "@/lib/processos-constants";

type UpdateProc = (args: { patch: any; expectedVersion: string | null | undefined }) => void;

export function ProcessMetadataSection({
  p,
  done,
  total,
  pct,
  collabs,
  onUpdate,
}: {
  p: any;
  done: number;
  total: number;
  pct: number;
  collabs: any[];
  onUpdate: UpdateProc;
}) {
  return (
    <Card className="p-4 md:col-span-2">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge className={getProcessStatusTone(p.status, "staff")}>{getProcessStatusLabel(p.status, "staff")}</Badge>
        <Badge variant="outline">{p.prioridade}</Badge>
        <span className="text-xs text-muted-foreground">
          Aberto em {new Date(p.data_abertura).toLocaleDateString("pt-BR")}
        </span>
        {p.prazo_final && <span className="text-xs text-muted-foreground">· Prazo {new Date(p.prazo_final).toLocaleDateString("pt-BR")}</span>}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Progress value={pct} className="h-2" />
        <span className="w-16 text-right text-sm text-muted-foreground">{done}/{total} · {pct}%</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={p.status} onValueChange={(v) => {
            if ((v === "aguardando_cliente" || v === "aguardando_orgao") && !((p.motivo_espera ?? "").trim())) {
              toast.error("Informe o motivo da espera antes de mudar o status.");
              return;
            }
            onUpdate({ patch: { status: v }, expectedVersion: p.updated_at });
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROCESS_STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prioridade</Label>
          <Select value={p.prioridade} onValueChange={(v) => onUpdate({ patch: { prioridade: v }, expectedVersion: p.updated_at })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROCESS_PRIORITY_OPTIONS.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Responsável</Label>
          <Select value={p.responsavel_id ?? "__none__"} onValueChange={(v) => onUpdate({ patch: { responsavel_id: v === "__none__" ? null : v }, expectedVersion: p.updated_at })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Nenhum —</SelectItem>
              {collabs.map((c: any) => <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prazo final</Label>
          {/* key={updated_at} força remount após conflito/atualização, restaurando o defaultValue com o valor do servidor. */}
          <Input key={`prazo:${p.updated_at}`} type="date" defaultValue={p.prazo_final ?? ""}
            onBlur={(e) => { const v = e.target.value || null; if (v !== p.prazo_final) onUpdate({ patch: { prazo_final: v }, expectedVersion: p.updated_at }); }} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">
            Motivo da espera
            {(p.status === "aguardando_cliente" || p.status === "aguardando_orgao") && <span className="text-red-600"> *</span>}
          </Label>
          <Input key={`motivo:${p.updated_at}`} defaultValue={p.motivo_espera ?? ""}
            placeholder="Obrigatório para status de espera (cliente/órgão)"
            onBlur={(e) => { if (e.target.value !== (p.motivo_espera ?? "")) onUpdate({ patch: { motivo_espera: e.target.value || null }, expectedVersion: p.updated_at }); }} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Observações</Label>
          <Textarea key={`obs:${p.updated_at}`} rows={2} defaultValue={p.observacoes ?? ""}
            onBlur={(e) => { if (e.target.value !== (p.observacoes ?? "")) onUpdate({ patch: { observacoes: e.target.value || null }, expectedVersion: p.updated_at }); }} />
        </div>
      </div>
    </Card>
  );
}
