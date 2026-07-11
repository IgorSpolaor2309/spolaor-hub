import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export function DemoBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900",
        className,
      )}
      title="Registro do ambiente de homologação — não é dado real"
    >
      <FlaskConical className="h-3 w-3" />
      {compact ? "Demo" : "Demonstração"}
    </span>
  );
}
