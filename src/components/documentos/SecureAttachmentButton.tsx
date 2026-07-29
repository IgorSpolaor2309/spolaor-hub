import { Button } from "@/components/ui/button";
import { Paperclip, Loader2 } from "lucide-react";
import { useDocumentFileUrl } from "@/hooks/documentos/use-document-file-url";

/**
 * Fase 7 — botão de anexo sem `storage_path`.
 *
 * A listagem recebe apenas `document_id`; a URL assinada é criada no
 * servidor exclusivamente no clique (`getDocumentSignedUrl`).
 */
export function SecureAttachmentButton({
  documentId,
  label,
  size = "sm",
  variant = "outline",
}: {
  documentId: string | null | undefined;
  label?: string | null;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
}) {
  const { open, openingId } = useDocumentFileUrl();
  const loading = !!documentId && openingId === documentId;

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={!documentId || loading}
      onClick={() => open(documentId)}
      data-testid="secure-attachment-button"
      className="max-w-[16rem]"
    >
      {loading ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Paperclip className="mr-1 h-4 w-4" />
      )}
      <span className="truncate">{label || "Abrir anexo"}</span>
    </Button>
  );
}
