import { Button, type ButtonProps } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  /** Caminho do arquivo no bucket privado `documents`. */
  storagePath?: string | null;
  /** Rótulo customizado. Padrão: "Abrir anexo". */
  label?: string;
  /** Rótulo quando não há anexo. Padrão: "Sem anexo". */
  emptyLabel?: string;
  /** Se true, mostra botão desabilitado quando não há anexo. */
  showWhenEmpty?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
};

/**
 * Botão padronizado para abrir anexos do bucket privado `documents`.
 * - Gera URL assinada (60s) sob demanda;
 * - Abre em nova aba (target="_blank", rel="noopener noreferrer"),
 *   mantendo o usuário dentro do SC Central;
 * - Respeita permissões do storage/RLS já existentes.
 */
export function AttachmentButton({
  storagePath,
  label = "Abrir anexo",
  emptyLabel = "Sem anexo",
  showWhenEmpty = false,
  size = "sm",
  variant = "secondary",
  className,
}: Props) {
  const [loading, setLoading] = useState(false);

  if (!storagePath) {
    if (!showWhenEmpty) return null;
    return (
      <Button size={size} variant="outline" disabled className={className}>
        <Paperclip className="mr-2 h-4 w-4" /> {emptyLabel}
      </Button>
    );
  }

  async function open() {
    if (!storagePath) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(storagePath, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("sem url");
      // Único caminho de abertura: link com target=_blank.
      // window.open + fallback simultâneo causava duas abas, pois
      // window.open com "noopener" pode retornar null mesmo quando abre.
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Não foi possível abrir o anexo. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={open}
      disabled={loading}
    >
      <ExternalLink className="mr-2 h-4 w-4" />
      {loading ? "Abrindo…" : label}
    </Button>
  );
}
