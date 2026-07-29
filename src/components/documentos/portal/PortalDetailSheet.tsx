import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBR } from "@/lib/dates";
import type { PortalRow } from "@/lib/documentos/portal-types";
import { useDocumentFileUrl } from "@/hooks/documentos/use-document-file-url";
import { useClientRequestFiles } from "@/hooks/documentos/use-request-file-history";

type Props = {
  row: PortalRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
};

function LabelValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 break-words">{children}</span>
    </div>
  );
}

export function PortalDetailSheet({ row, open, onOpenChange, userId }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  // Fase 6: a URL temporária vem do servidor; o Portal não lê storage_path.
  const { open: openDocument, openingId } = useDocumentFileUrl();

  const isRequest = row?.item_kind === "document_request";
  const canSubmit = isRequest && row.action_owner === "client";

  const history = useClientRequestFiles(
    isRequest ? row.item_id : null,
    open && Boolean(isRequest),
  );
  const versions = history.data ?? [];

  const submit = useMutation({
    mutationFn: async () => {
      if (!row || !file || !userId) throw new Error("Selecione um arquivo.");
      if (row.item_kind !== "document_request") throw new Error("Item inválido.");
      const path = `${row.client_id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("documents").upload(path, file);
      if (up.error) throw up.error;

      // A RPC registra o documento, cria a versão no histórico 1:N e move a
      // solicitação para "recebido" em uma única transação.
      const { error } = await supabase.rpc("client_submit_document_request", {
        _request_id: row.item_id,
        _storage_path: path,
        _nome: file.name,
        _tipo: row.tipo ?? undefined,
      });
      if (error) throw error;
    },

    onSuccess: () => {
      toast.success("Documento enviado. A contabilidade vai revisar em breve.");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["portal-docs"] });
      qc.invalidateQueries({ queryKey: ["doc-request-files"] });
      // "O que preciso fazer" (cliente) sai da lista sem reload manual.
      qc.invalidateQueries({ queryKey: ["client-pendings"] });
      onOpenChange(false);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Falha ao enviar";
      toast.error(/row-level security|permission/i.test(msg) ? "Sem permissão para enviar neste item." : msg);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-6">{row?.titulo ?? "Detalhes"}</SheetTitle>
        </SheetHeader>

        {row && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{row.status_label}</Badge>
              {row.is_demo && <Badge variant="outline">demo</Badge>}
              {row.is_expired && <Badge variant="destructive">Vencido</Badge>}
              {!row.is_expired && row.is_expiring && <Badge variant="secondary">Vencendo</Badge>}
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              {row.empresa_nome && <LabelValue label="Empresa">{row.empresa_nome}</LabelValue>}
              {row.categoria && <LabelValue label="Categoria">{row.categoria}</LabelValue>}
              {row.tipo && <LabelValue label="Tipo">{row.tipo}</LabelValue>}
              {row.departamento && <LabelValue label="Departamento">{row.departamento}</LabelValue>}
              {row.competencia && <LabelValue label="Competência">{row.competencia}</LabelValue>}
              {row.prazo && <LabelValue label="Prazo">{formatBR(row.prazo)}</LabelValue>}
              {row.data_validade && <LabelValue label="Validade">{formatBR(row.data_validade)}</LabelValue>}
              {row.process_type_name && <LabelValue label="Processo">{row.process_type_name}</LabelValue>}
            </div>

            {row.descricao_resumida && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm whitespace-pre-wrap">{row.descricao_resumida}</p>
                </div>
              </>
            )}

            {row.has_document && row.document_id && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Arquivo atual</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDocument(row.document_id)}
                    disabled={openingId === row.document_id}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {openingId === row.document_id ? "Abrindo…" : (row.document_name ?? "Abrir arquivo")}
                  </Button>
                </div>
              </>
            )}

            {isRequest && (history.isLoading || versions.length > 0) && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Seus envios</p>
                  {history.isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {versions.map((v) => (
                        <li
                          key={v.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {v.label}
                              {v.active && (
                                <Badge variant="secondary" className="ml-2 align-middle">
                                  Atual
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Enviado em {formatBR(v.submitted_at)}
                              {v.document_name ? ` · ${v.document_name}` : ""}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDocument(v.document_id)}
                            disabled={openingId === v.document_id}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            {openingId === v.document_id ? "Abrindo…" : "Ver"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {canSubmit && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm">
                    {row.status === "reenviar" ? "Reenviar arquivo" : "Enviar arquivo"}
                  </Label>
                  <Input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    disabled={submit.isPending}
                  />
                  <Button
                    onClick={() => submit.mutate()}
                    disabled={!file || submit.isPending}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {submit.isPending ? "Enviando…" : "Enviar para a contabilidade"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {versions.length > 0
                      ? "Seu envio anterior continua guardado. O novo arquivo passa a ser o atual."
                      : "Depois de enviar, o item vai para revisão da contabilidade."}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
