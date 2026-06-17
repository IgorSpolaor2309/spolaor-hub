import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_COMPANIES, type MyClient } from "@/hooks/use-my-clients";
import { clientLabel } from "@/lib/client-display";

type Props = {
  clients: MyClient[];
  value: string;
  onChange: (v: string) => void;
  /** Se false, esconde a opção "Todas as empresas". */
  allowAll?: boolean;
  label?: string;
  className?: string;
};

export function CompanySelector({ clients, value, onChange, allowAll = true, label = "Empresa", className }: Props) {
  if (clients.length <= 1) return null;
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value={ALL_COMPANIES}>Todas as empresas</SelectItem>}
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {clientLabel(c)}
              {c.documento ? ` · ${c.documento}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
