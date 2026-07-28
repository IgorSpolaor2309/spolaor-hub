import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ExternalLink, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBR } from "@/lib/dates";
import type { PortalRow } from "@/lib/documentos/portal-types";

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
  const [openingAttachment, setOpeningAttachment] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const canSubmit = row?.item_kind === "document_request" && row.action_owner === "client";

  async function openAttachment() {
    if (!row?.document_id) return;
    setOpeningAttachment(true);
    try {
      // storage_path é omitido da RPC do cliente por design (§2.3).
      // Buscamos sob demanda; RLS de `documents` restringe ao próprio cliente.
      const { data, error } = await supabase
        .from("documents")
        .select("storage_path")
        .eq("id", row.document_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data?.storage_path) throw error ?? new Error("sem anexo");
      const { data: signed, error: sErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(data.storage_path, 60);
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("sem url");
      const a = document.createElement("a");
      a.href = signed.signedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Não foi possível abrir o anexo. Tente novamente.");
    } finally {
      setOpeningAttachment(false);
    }
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!row || !file || !userId) throw new Error("Selecione um arquivo.");
      if (row.item_kind !== "document_request") throw new Error("Item inválido.");
      const path = `${row.client_id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("documents").upload(path, file);
      if (up.error) throw up.error;

      const insert = await supabase
        .from("documents")
        .insert({
          client_id: row.client_id,
          nome: file.name,
          tipo: row.tipo ?? "outro",
          competencia: row.competencia ?? null,
          storage_path: path,
          uploaded_by: userId,
          status: "recebido",
        })
        .select("id")
        .single();
      if (insert.error) throw insert.error;

      const upd = await supabase
        .from("document_requests")
        .update({ document_id: insert.data.id, status: "recebido" })
        .eq("id", row.item_id);
      if (upd.error) throw upd.error;
    },
    onSuccess: () => {
      toast.success("Documento enviado. A contabilidade vai revisar em breve.");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["portal-docs"] });
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
                  <p className="text-xs font-medium text-muted-foreground mb-2">Arquivo anexado</p>
                  <Button variant="outline" size="sm" onClick={openAttachment} disabled={openingAttachment}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {openingAttachment ? "Abrindo…" : (row.document_name ?? "Abrir anexo")}
                  </Button>
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
                    Depois de enviar, o item vai para revisão da contabilidade.
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
