import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

export type MultiSelectOption = { value: string; label: string; hint?: string | null };

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Buscar…",
  emptyMessage = "Nenhum item disponível.",
  noneSelectedMessage = "Nenhum selecionado.",
}: {
  options: MultiSelectOption[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  noneSelectedMessage?: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        (o.hint ?? "").toLowerCase().includes(term),
    );
  }, [options, q]);

  const selectedSet = new Set(value);
  const selectedOptions = options.filter((o) => selectedSet.has(o.value));

  function toggle(v: string) {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  }

  return (
    <div className="space-y-2">
      {selectedOptions.length === 0 ? (
        <p className="text-xs text-muted-foreground">{noneSelectedMessage}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((o) => (
            <Badge key={o.value} variant="secondary" className="gap-1">
              {o.label}
              <button
                type="button"
                onClick={() => toggle(o.value)}
                className="ml-0.5 rounded-sm hover:bg-muted"
                aria-label={`Remover ${o.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8"
      />
      <div className="max-h-48 overflow-y-auto rounded-md border">
        {options.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Sem resultados.</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((o) => (
              <li key={o.value} className="flex items-center gap-2 p-2 hover:bg-muted/40">
                <Checkbox
                  id={`ms-${o.value}`}
                  checked={selectedSet.has(o.value)}
                  onCheckedChange={() => toggle(o.value)}
                />
                <label
                  htmlFor={`ms-${o.value}`}
                  className="flex-1 cursor-pointer text-sm"
                >
                  <span>{o.label}</span>
                  {o.hint && (
                    <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
