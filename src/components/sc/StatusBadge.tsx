import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; cls: string }> = {
  // tasks
  aberta: { label: "Aberta", cls: "bg-info/10 text-info border-info/30" },
  em_andamento: { label: "Em andamento", cls: "bg-secondary/10 text-secondary border-secondary/30" },
  aguardando_cliente: { label: "Aguardando cliente", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
  em_revisao: { label: "Em revisão", cls: "bg-accent/15 text-accent-foreground border-accent/40" },
  concluida: { label: "Concluída", cls: "bg-success/10 text-success border-success/30" },
  vencida: { label: "Vencida", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelada: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
  // docs
  recebido: { label: "Recebido", cls: "bg-info/10 text-info border-info/30" },
  em_analise: { label: "Em análise", cls: "bg-secondary/10 text-secondary border-secondary/30" },
  aprovado: { label: "Aprovado", cls: "bg-success/10 text-success border-success/30" },
  recusado: { label: "Recusado", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  // generic
  // client_month_status
  aguardando_documentos: { label: "Aguardando documentos", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
  documentos_recebidos: { label: "Documentos recebidos", cls: "bg-info/10 text-info border-info/30" },
  pendencias_encontradas: { label: "Pendências encontradas", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  em_fechamento: { label: "Em fechamento", cls: "bg-secondary/10 text-secondary border-secondary/30" },
  fechado: { label: "Fechado", cls: "bg-success/10 text-success border-success/30" },
  enviado_ao_cliente: { label: "Enviado ao cliente", cls: "bg-success/10 text-success border-success/30" },
  enviada_ao_cliente: { label: "Enviada ao cliente", cls: "bg-success/10 text-success border-success/30" },
  enviado_pelo_cliente: { label: "Enviado pelo cliente", cls: "bg-info/10 text-info border-info/30" },
  pendente: { label: "Pendente", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
  // generic
  active: { label: "Ativo", cls: "bg-success/10 text-success border-success/30" },
  inactive: { label: "Inativo", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const e = MAP[value] ?? { label: value, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        e.cls,
        className,
      )}
    >
      {e.label}
    </span>
  );
}

export function PriorityBadge({ value }: { value: string }) {
  const m: Record<string, string> = {
    baixa: "bg-muted text-muted-foreground border-border",
    media: "bg-info/10 text-info border-info/30",
    alta: "bg-warning/15 text-warning-foreground border-warning/40",
    urgente: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", m[value] ?? m.media)}>
      {value}
    </span>
  );
}
