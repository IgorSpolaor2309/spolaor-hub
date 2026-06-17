import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Search, X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AccountMatch = { id: string; full_name: string | null; email: string | null };

export function AccountLookup({
  value,
  onChange,
}: {
  value: AccountMatch | null;
  onChange: (v: AccountMatch | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function search() {
    const target = email.trim();
    if (!target) return;
    setLoading(true);
    setNotFound(false);
    try {
      const { data, error } = await supabase.rpc("admin_find_profile_by_email", { _email: target });
      if (error) throw error;
      const found = Array.isArray(data) && data.length > 0 ? (data[0] as AccountMatch) : null;
      if (found) {
        onChange(found);
        toast.success("Conta encontrada");
      } else {
        setNotFound(true);
        onChange(null);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao buscar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <Label className="text-sm font-semibold">
        Conta de acesso vinculada <span className="text-destructive">*</span>
      </Label>
      <p className="text-xs text-muted-foreground">
        Informe o e-mail de uma conta de acesso já existente. A empresa será vinculada a essa conta no salvar.
      </p>

      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            <div>
              <div className="font-medium">{value.full_name || "(sem nome)"}</div>
              <div className="text-xs">{value.email}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => { onChange(null); setEmail(""); setNotFound(false); }}
            aria-label="Limpar conta"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="email@empresa.com.br"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setNotFound(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
            />
            <Button type="button" onClick={search} disabled={loading || !email.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Buscar conta</span>
            </Button>
          </div>
          {notFound && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Esta conta ainda não existe. Crie primeiro o acesso do usuário em Configurações para depois vincular a empresa.
            </div>
          )}
        </>
      )}
    </div>
  );
}
