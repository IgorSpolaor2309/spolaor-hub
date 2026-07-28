import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "zinc" | "blue" | "indigo";
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-700"
      : tone === "blue" ? "text-blue-700"
      : tone === "indigo" ? "text-indigo-700"
      : tone === "zinc" ? "text-zinc-600"
      : "text-foreground";
  return (
    <Card className="p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"text-xl font-semibold " + toneCls}>{value}</div>
    </Card>
  );
}
