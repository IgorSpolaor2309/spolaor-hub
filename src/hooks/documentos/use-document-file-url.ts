import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDocumentSignedUrl } from "@/lib/documentos/files.functions";

/**
 * Fase 6 — abre um documento por URL temporária gerada no servidor.
 * Nenhum `storage_path` trafega para o navegador, e a URL só é criada
 * no clique (nunca durante a listagem).
 */
export function useDocumentFileUrl() {
  const fetchUrl = useServerFn(getDocumentSignedUrl);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = useCallback(
    async (documentId: string | null | undefined) => {
      if (!documentId) return;
      setOpeningId(documentId);
      try {
        const { url } = await fetchUrl({ data: { documentId } });
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Não foi possível abrir o arquivo.";
        toast.error(msg);
      } finally {
        setOpeningId(null);
      }
    },
    [fetchUrl],
  );

  return { open, openingId, isOpening: openingId !== null };
}
