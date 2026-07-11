import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DemoFilterValue = "real" | "demo" | "all";

export function DemoFilter({
  value,
  onChange,
  className,
}: {
  value: DemoFilterValue;
  onChange: (value: DemoFilterValue) => void;
  className?: string;
}) {
  const options: { value: DemoFilterValue; label: string }[] = [
    { value: "real", label: "Dados reais" },
    { value: "demo", label: "Demonstração" },
    { value: "all", label: "Todos" },
  ];
  return (
    <div className={cn("inline-flex rounded-md border p-0.5", className)} role="group" aria-label="Filtro por origem">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "ghost"}
          className="h-7 px-2 text-xs"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function matchesDemoFilter(row: { is_demo?: boolean | null } | null | undefined, filter: DemoFilterValue): boolean {
  if (!row) return filter !== "demo";
  const isDemo = !!row.is_demo;
  if (filter === "all") return true;
  if (filter === "demo") return isDemo;
  return !isDemo;
}
