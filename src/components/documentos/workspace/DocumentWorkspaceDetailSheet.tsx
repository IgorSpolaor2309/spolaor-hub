import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { Link } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
import type { WorkspaceRow } from "@/lib/documentos/workspace-types";
import { RowRapidActions } from "./RowRapidActions";
import { RequestFileHistory } from "./RequestFileHistory";
import { ReuseDocumentDialog } from "./ReuseDocumentDialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { useWorkspaceActions } from "@/hooks/documentos/use-document-workspace-actions";

type Props = {
  row: WorkspaceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  actions: ReturnType<typeof useWorkspaceActions>;
};

function LabelValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="col-span-2 break-words">{children}</span>
    </div>
  );
}

export function DocumentWorkspaceDetailSheet({ row, open, onOpenChange, actions }: Props) {
  const { role } = useCurrentUser();
  const isAdmin = role === "admin";
  const isRequest = row?.item_kind === "document_request";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-6">{row?.titulo ?? "Detalhes"}</SheetTitle>
        </SheetHeader>

        {row && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{row.item_kind === "document_request" ? "Solicitação" : "Documento"}</Badge>
              {row.status && <Badge variant="outline">{row.status_label}</Badge>}
              {row.is_demo && <Badge variant="outline">demo</Badge>}
              {row.is_expired && <Badge variant="destructive">Vencido</Badge>}
              {!row.is_expired && row.is_expiring && <Badge variant="secondary">Vencendo</Badge>}
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <LabelValue label="Empresa">
                <Link to="/clientes/$id" params={{ id: row.client_id }} className="hover:underline">
                  {row.empresa_nome ?? "—"}
                </Link>
              </LabelValue>
              {row.empresa_documento && <LabelValue label="CNPJ">{row.empresa_documento}</LabelValue>}
              <LabelValue label="Categoria">{row.categoria ?? "—"}</LabelValue>
              <LabelValue label="Tipo">{row.tipo ?? "—"}</LabelValue>
              <LabelValue label="Departamento">{row.departamento ?? "—"}</LabelValue>
              <LabelValue label="Competência">{row.competencia ?? "—"}</LabelValue>
              <LabelValue label="Responsável">{row.responsavel_nome ?? "—"}</LabelValue>
              <LabelValue label="Prazo">{row.prazo ? formatBR(row.prazo) : "—"}</LabelValue>
              <LabelValue label="Validade">{row.data_validade ? formatBR(row.data_validade) : "—"}</LabelValue>
              <LabelValue label="Criado em">{formatBR(row.created_at)}</LabelValue>
              <LabelValue label="Atualizado em">{formatBR(row.updated_at)}</LabelValue>
              <LabelValue label="Ação pendente">
                {row.action_owner === "client" ? "Cliente" : row.action_owner === "staff" ? "Equipe" : "Nenhuma"}
              </LabelValue>
            </div>

            {row.descricao_resumida && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                  <p className="text-sm whitespace-pre-line">{row.descricao_resumida}</p>
                </div>
              </>
            )}

            {row.has_process_link && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Vínculo com processo</p>
                  {row.process_type_name && <p className="text-sm">Tipo: {row.process_type_name}</p>}
                  {row.process_step_name && <p className="text-sm">Etapa: {row.process_step_name}</p>}
                  {row.company_process_id && (
                    <Link
                      to="/processos/$id"
                      params={{ id: row.company_process_id }}
                      search={{ client: undefined }}
                      className="text-sm text-primary hover:underline"
                    >
                      Abrir processo →
                    </Link>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              {row.has_document && row.document_storage_path ? (
                <AttachmentButton
                  storagePath={row.document_storage_path}
                  label={row.document_name ?? "Abrir anexo"}
                  size="sm"
                  variant="default"
                />
              ) : (
                <Button variant="outline" size="sm" disabled>Sem documento anexado</Button>
              )}
              {isRequest && (
                <ReuseDocumentDialog
                  requestId={row.item_id}
                  clientId={row.client_id}
                  competencia={row.competencia}
                />
              )}
              <RowRapidActions row={row} actions={actions} />
            </div>

            {isRequest && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Histórico de arquivos
                  </p>
                  <RequestFileHistory requestId={row.item_id} open={open} isAdmin={isAdmin} />
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
