import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ProcessAuditRow({ event }: { event: any }) {
  const [open, setOpen] = useState(false);
  const meta = event.metadata ?? {};
  const hasOldNew = meta.old !== undefined || meta.new !== undefined;
  const entity = event.tipo?.startsWith("processo_etapa_") ? "company_process_steps"
    : event.tipo?.startsWith("processo_") ? "company_processes" : "—";
  return (
    <li className="text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-baseline gap-2 p-3 text-left hover:bg-muted/40">
        {open ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
        <Badge variant="outline" className="text-[10px]">{event.tipo}</Badge>
        <span className="font-medium">{event.descricao}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(event.created_at).toLocaleString("pt-BR")}
        </span>
      </button>
      {open && (
        <div className="grid gap-1 border-t bg-muted/20 px-3 py-2 text-xs sm:grid-cols-2">
          <div><span className="text-muted-foreground">Usuário:</span> {event.actor_name ?? "sistema"}</div>
          <div><span className="text-muted-foreground">Papel/Origem:</span> {meta.origem_ator ?? "—"}</div>
          <div><span className="text-muted-foreground">Entidade:</span> {entity}</div>
          <div><span className="text-muted-foreground">Ação:</span> {event.tipo}</div>
          {meta.step_id && <div><span className="text-muted-foreground">Etapa (id):</span> <code className="rounded bg-background px-1">{meta.step_id}</code></div>}
          {meta.process_id && <div><span className="text-muted-foreground">Processo (id):</span> <code className="rounded bg-background px-1">{meta.process_id}</code></div>}
          {hasOldNew && (
            <>
              <div><span className="text-muted-foreground">Valor anterior:</span> <code className="rounded bg-background px-1">{String(meta.old ?? "—")}</code></div>
              <div><span className="text-muted-foreground">Valor novo:</span> <code className="rounded bg-background px-1">{String(meta.new ?? "—")}</code></div>
            </>
          )}
          {meta.motivo_espera && <div className="sm:col-span-2"><span className="text-muted-foreground">Motivo:</span> {meta.motivo_espera}</div>}
        </div>
      )}
    </li>
  );
}
