import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { ExternalLink, FileSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBR } from "@/lib/dates";
import { useDocumentFileUrl } from "@/hooks/documentos/use-document-file-url";
import {
  HISTORY_QK,
  type ReusableDocument,
  type ReusableDocumentPage,
} from "@/lib/documentos/history-types";

type Props = {
  requestId: string;
  clientId: string;
  competencia?: string | null;
};

const PAGE_SIZE = 10;

/**
 * Fase 6 — "Usar documento existente".
 * Busca server-side e paginada, restrita à mesma empresa (a RPC valida
 * carteira, Real/Demo e exclusão). Nenhum arquivo é copiado no storage.
 */
export function ReuseDocumentDialog({ requestId, clientId, competencia }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReusableDocument | null>(null);
  const { open: openDocument, openingId } = useDocumentFileUrl();

  const args = { clientId, search: search.trim() || null, page };
  const query = useQuery({
    queryKey: HISTORY_QK.reusable(args),
    enabled: open,
    queryFn: async (): Promise<ReusableDocumentPage> => {
      const { data, error } = await supabase.rpc("search_client_documents_paginated", {
        _client_id: clientId,
        _search: args.search ?? undefined,
        _competencia: competencia ?? undefined,
        _page: page,
        _page_size: PAGE_SIZE,
      });
      if (error) throw error;
      return data as unknown as ReusableDocumentPage;
    },
  });

  const attach = useMutation({
    mutationFn: async (documentId: string) => {
      const { error } = await supabase.rpc("staff_attach_document_to_request", {
        _request_id: requestId,
        _document_id: documentId,
        _submission_type: "reaproveitado",
        _set_recebido: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento vinculado à solicitação.");
      qc.invalidateQueries({ queryKey: ["doc-request-files"] });
      qc.invalidateQueries({ queryKey: ["document-workspace"] });
      setSelected(null);
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Não foi possível vincular o documento."),
  });

  const items = query.data?.items ?? [];
  const totalPages = query.data?.total_pages ?? 1;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FileSearch className="mr-2 h-4 w-4" />
            Usar documento existente
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Usar documento existente</DialogTitle>
            <DialogDescription>
              Apenas documentos desta mesma empresa. O arquivo não é duplicado — a solicitação
              passa a apontar para o documento escolhido.
            </DialogDescription>
          </DialogHeader>

          <Input
            placeholder="Buscar por nome do documento…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />

          <div className="max-h-80 overflow-y-auto flex flex-col gap-2">
            {query.isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nenhum documento encontrado para esta empresa.
              </p>
            ) : (
              items.map((doc) => (
                <div
                  key={doc.document_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{doc.nome ?? "Documento"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[doc.tipo, doc.competencia].filter(Boolean).join(" · ") || "—"}
                      {doc.data_validade ? ` · validade ${formatBR(doc.data_validade)}` : ""}
                      {` · ${formatBR(doc.created_at)}`}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {doc.is_demo && <Badge variant="outline">demo</Badge>}
                      {doc.linked_processes > 0 && (
                        <Badge variant="secondary">
                          Vinculado a {doc.linked_processes} processo(s)
                        </Badge>
                      )}
                      {doc.linked_requests > 0 && (
                        <Badge variant="secondary">
                          Usado em {doc.linked_requests} solicitação(ões)
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDocument(doc.document_id)}
                      disabled={openingId === doc.document_id}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {openingId === doc.document_id ? "Abrindo…" : "Ver"}
                    </Button>
                    <Button size="sm" onClick={() => setSelected(doc)}>
                      Selecionar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={selected !== null} onOpenChange={(v) => !v && setSelected(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vincular este documento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{selected?.nome ?? "Documento"}" passará a ser o arquivo atual desta solicitação e
              uma nova versão será registrada no histórico. O status muda para recebido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selected && attach.mutate(selected.document_id)}
              disabled={attach.isPending}
            >
              {attach.isPending ? "Vinculando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
