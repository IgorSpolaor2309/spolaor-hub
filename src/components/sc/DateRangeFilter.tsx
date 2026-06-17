import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DATE_PRESETS, type DatePreset } from "@/lib/date-ranges";

export type DateFilterValue = {
  preset: DatePreset;
  from: string;
  to: string;
};

export const EMPTY_DATE_FILTER: DateFilterValue = { preset: "all", from: "", to: "" };

export function DateRangeFilter({
  value,
  onChange,
  label = "Período",
  className,
}: {
  value: DateFilterValue;
  onChange: (v: DateFilterValue) => void;
  label?: string;
  className?: string;
}) {
  const isCustom = value.preset === "custom";
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value.preset} onValueChange={(p) => onChange({ ...value, preset: p as DatePreset })}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isCustom && (
          <>
            <Input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="w-[150px]"
              aria-label="Data inicial"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="w-[150px]"
              aria-label="Data final"
            />
          </>
        )}
      </div>
    </div>
  );
}
