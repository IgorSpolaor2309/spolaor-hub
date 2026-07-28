import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { AlertCircle, AlertTriangle, Building2, CalendarClock, CheckCircle2, ClipboardList, FileText, LinkIcon, User } from "lucide-react";
import { formatBR } from "@/lib/dates";
import type { WorkspaceRow } from "@/lib/documentos/workspace-types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<string, string> = {
  aguardando: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-900",
  recebido: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-100 dark:border-blue-900",
  reenviar: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-100 dark:border-rose-900",
  concluido: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-900",
  cancelado: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

const OWNER_LABEL: Record<WorkspaceRow["action_owner"], string> = {
  client: "Cliente precisa agir",
  staff: "Equipe precisa agir",
  none: "Sem ação pendente",
};
const OWNER_TONE: Record<WorkspaceRow["action_owner"], string> = {
  client: "text-amber-700 dark:text-amber-300",
  staff: "text-blue-700 dark:text-blue-300",
  none: "text-muted-foreground",
};

type Props = {
  row: WorkspaceRow;
  onOpen: (row: WorkspaceRow) => void;
  actions?: React.ReactNode;
};

export function DocumentWorkspaceRow({ row, onOpen, actions }: Props) {
  const statusTone = row.status ? STATUS_TONE[row.status] ?? "" : "";
  return (
    <Card className="p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0">
          {row.item_kind === "document_request" ? (
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          ) : (
            <FileText className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <button
                onClick={() => onOpen(row)}
                className="font-medium text-left hover:underline decoration-dotted underline-offset-4 truncate max-w-full"
              >
                {row.titulo}
              </button>
              {row.descricao_resumida && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                  {row.descricao_resumida}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {row.status && (
                <Badge variant="outline" className={cn("border", statusTone)}>
                  {row.status_label}
                </Badge>
              )}
              {row.is_demo && (
                <Badge variant="outline" className="border-purple-300 text-purple-800 dark:border-purple-800 dark:text-purple-200">demo</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {row.empresa_nome ?? "—"}
            </span>
            {row.competencia && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {row.competencia}
              </span>
            )}
            {row.responsavel_nome && (
              <span className="inline-flex items-center gap-1">
                <User className="h-3 w-3" />
                {row.responsavel_nome}
              </span>
            )}
            {row.prazo && (
              <span className="inline-flex items-center gap-1">
                Prazo: {formatBR(row.prazo)}
              </span>
            )}
            {row.data_validade && (
              <span className="inline-flex items-center gap-1">
                Validade: {formatBR(row.data_validade)}
              </span>
            )}
            {row.has_process_link && (
              <span className="inline-flex items-center gap-1 text-primary">
                <LinkIcon className="h-3 w-3" />
                Vinculado{row.links_count > 1 ? ` (${row.links_count})` : ""}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn("text-xs font-medium inline-flex items-center gap-1", OWNER_TONE[row.action_owner])}>
                {row.action_owner === "client" && <AlertCircle className="h-3 w-3" />}
                {row.action_owner === "staff" && <AlertCircle className="h-3 w-3" />}
                {row.action_owner === "none" && <CheckCircle2 className="h-3 w-3" />}
                {OWNER_LABEL[row.action_owner]}
              </span>
              {row.is_expired && (
                <span className="text-xs inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-3 w-3" /> Vencido
                </span>
              )}
              {!row.is_expired && row.is_expiring && (
                <span className="text-xs inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> Vencendo em 30 dias
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {row.has_document && row.document_storage_path && (
                <AttachmentButton
                  storagePath={row.document_storage_path}
                  fileName={row.document_name ?? "documento"}
                  size="sm"
                  variant="outline"
                />
              )}
              <Button variant="outline" size="sm" onClick={() => onOpen(row)}>Abrir</Button>
              {actions}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
