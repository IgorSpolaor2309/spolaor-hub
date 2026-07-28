import { useState } from "react";
import { toast } from "sonner";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function PublicTextsPopover({
  title,
  values,
  fields,
  onSave,
}: {
  title: string;
  values: Record<string, string | null>;
  fields: { key: string; label: string; textarea?: boolean; placeholder?: string }[];
  onSave: (patch: Record<string, string | null>) => Promise<any>;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "") as string]))
  );
  const [saving, setSaving] = useState(false);
  const filled = fields.some((f) => (values[f.key] ?? "").toString().trim() !== "");
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setState(Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? "") as string]))); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" title="Editar textos exibidos ao cliente">
          <Globe className={"h-3.5 w-3.5 " + (filled ? "text-blue-600" : "text-muted-foreground")} />
          Textos
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-2">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-[11px] text-muted-foreground">Deixe em branco para usar o texto interno padrão.</p>
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            {f.textarea
              ? <Textarea rows={2} value={state[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))} />
              : <Input value={state[f.key] ?? ""} placeholder={f.placeholder}
                  onChange={(e) => setState((s) => ({ ...s, [f.key]: e.target.value }))} />}
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button size="sm" disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              const patch: Record<string, string | null> = {};
              for (const f of fields) {
                const v = (state[f.key] ?? "").trim();
                patch[f.key] = v === "" ? null : v;
              }
              await onSave(patch);
              toast.success("Textos públicos atualizados");
              setOpen(false);
            } catch (e: any) { toast.error(e.message ?? "Falha"); } finally { setSaving(false); }
          }}>Salvar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
