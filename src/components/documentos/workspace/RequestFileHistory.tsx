import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ExternalLink, History, RotateCcw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBR } from "@/lib/dates";
import { useDocumentFileUrl } from "@/hooks/documentos/use-document-file-url";
import { useStaffRequestFiles } from "@/hooks/documentos/use-request-file-history";
import {
  SUBMISSION_TYPE_LABEL,
  SUBMITTED_BY_ROLE_LABEL,
} from "@/lib/documentos/history-types";

type Props = {
  requestId: string;
  open: boolean;
  isAdmin: boolean;
};

/**
 * Fase 6 — histórico 1:N de versões (Central staff).
 * Carregado só quando o Sheet abre; nunca na listagem principal.
 */
export function RequestFileHistory({ requestId, open, isAdmin }: Props) {
  const qc = useQueryClient();
  const { open: openDocument, openingId } = useDocumentFileUrl();
  const query = useStaffRequestFiles(requestId, open);
  const versions = query.data ?? [];

  const setActive = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase.rpc("staff_set_active_request_file", { _file_id: fileId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Versão definida como atual.");
      qc.invalidateQueries({ queryKey: ["doc-request-files"] });
      qc.invalidateQueries({ queryKey: ["document-workspace"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar a versão."),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum arquivo enviado ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {versions.map((v) => (
        <li key={v.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                Versão {v.version_number}
                {v.active && <Badge variant="secondary">Atual</Badge>}
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {v.document_name ?? "Arquivo"} · {SUBMISSION_TYPE_LABEL[v.submission_type]}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatBR(v.submitted_at)} · {v.submitted_by_name ?? "—"} (
                {SUBMITTED_BY_ROLE_LABEL[v.submitted_by_role]})
                {v.request_status_at ? ` · status no envio: ${v.request_status_at}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openDocument(v.document_id)}
                disabled={openingId === v.document_id}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {openingId === v.document_id ? "Abrindo…" : "Ver"}
              </Button>

              {isAdmin && !v.active && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={setActive.isPending}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Usar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Usar esta versão como atual?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A versão {v.version_number} passará a ser o documento atual da
                        solicitação. Nenhuma versão é apagada.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setActive.mutate(v.id)}>
                        Confirmar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
