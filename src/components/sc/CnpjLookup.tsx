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
}: {
  value: string;
  onChange: (v: string) => void;
  onResult: (data: ReceitaData) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleLookup() {
    const digits = onlyDigits(value);
    if (!isValidCnpjLength(digits)) {
      toast.error("CNPJ inválido. Verifique os números digitados.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("consultar-cnpj", {
        body: { cnpj: digits },
      });
      if (error) {
        // tenta extrair mensagem amigável vinda da função
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
        toast.success("Dados do CNPJ encontrados. Revise antes de salvar.");
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
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          value={maskCNPJ(value)}
          onChange={(e) => onChange(onlyDigits(e.target.value))}
          disabled={disabled || loading}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={handleLookup}
          disabled={disabled || loading || !isValidCnpjLength(value)}
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consultando…</>
          ) : (
            <><Search className="mr-2 h-4 w-4" /> Consultar CNPJ</>
          )}
        </Button>
      </div>
    </div>
  );
}
