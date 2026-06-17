import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { maskCNPJ, onlyDigits, isValidCnpjLength } from "@/lib/cnpj";

export type ReceitaData = {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  cnae_fiscal: string | null;
  cnae_fiscal_descricao: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  porte: string | null;
  natureza_juridica: string | null;
  qsa: any[];
  simples: any;
  mei: any;
  capital_social: number | string | null;
  _raw?: any;
};

export function CnpjLookup({
  value,
  onChange,
  onResult,
  disabled,
  label = "CNPJ",
  buttonLabel = "Buscar dados pelo CNPJ",
  helperText = "Busque os dados públicos da empresa automaticamente. Depois você pode revisar e completar as informações manualmente.",
}: {
  value: string;
  onChange: (v: string) => void;
  onResult: (data: ReceitaData) => void;
  disabled?: boolean;
  label?: string;
  buttonLabel?: string;
  helperText?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const digits = onlyDigits(value);
  const canLookup = isValidCnpjLength(digits);

  async function handleLookup() {
    if (!canLookup) {
      toast.error("Informe um CNPJ com 14 dígitos antes de buscar.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("consultar-cnpj", {
        body: { cnpj: digits },
      });
      if (error) {
        let msg = "Não foi possível consultar o CNPJ agora. Tente novamente em alguns instantes.";
        const ctx: any = (error as any).context;
        try {
          if (ctx && typeof ctx.json === "function") {
            const j = await ctx.json();
            if (j?.error) msg = j.error;
          }
        } catch { /* noop */ }
        toast.error(msg);
        return;
      }
      if (!data || (data as any).error) {
        toast.error((data as any)?.error ?? "Erro ao consultar CNPJ.");
        return;
      }
      const result = data as ReceitaData;
      onResult(result);
      const ativo = (result.descricao_situacao_cadastral ?? "").toUpperCase() === "ATIVA";
      if (ativo) {
        toast.success("Dados encontrados. Revise e complete as informações antes de salvar.");
      } else {
        toast.warning(
          `Atenção: este CNPJ está com situação cadastral "${result.descricao_situacao_cadastral ?? "desconhecida"}".`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao consultar CNPJ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div>
        <Label className="text-sm font-semibold">{label}</Label>
        {helperText && (
          <p className="mt-0.5 text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          value={maskCNPJ(value)}
          onChange={(e) => onChange(onlyDigits(e.target.value))}
          disabled={disabled || loading}
          className="bg-background"
        />
        <Button
          type="button"
          onClick={handleLookup}
          disabled={disabled || loading || !canLookup}
          className="sm:w-auto w-full whitespace-nowrap"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando…</>
          ) : (
            <><Search className="mr-2 h-4 w-4" /> {buttonLabel}</>
          )}
        </Button>
      </div>
      {!canLookup && value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Digite os 14 números do CNPJ para habilitar a busca.
        </p>
      )}
    </div>
  );
}
