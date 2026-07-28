import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { WorkspaceRow } from "@/lib/documentos/workspace-types";
import type { useWorkspaceActions } from "@/hooks/documentos/use-document-workspace-actions";

type Actions = ReturnType<typeof useWorkspaceActions>;

/** Renderiza somente as transições realmente válidas para o status atual. */
export function RowRapidActions({ row, actions }: { row: WorkspaceRow; actions: Actions }) {
  if (row.item_kind !== "document_request") return null;
  const { canTransition } = actions;

  return (
    <div className="flex items-center gap-2">
      {canTransition(row.status, "concluido") && (
        <ConfirmAction
          label="Concluir"
          title="Concluir solicitação?"
          description="Esta ação encerra a solicitação. O checklist e vínculos serão marcados como concluídos automaticamente."
          onConfirm={() => actions.concluir.mutate(row)}
          loading={actions.concluir.isPending}
        />
      )}
      {canTransition(row.status, "reenviar") && (
        <ConfirmAction
          label="Reenviar"
          title="Solicitar reenvio ao cliente?"
          description="O cliente será notificado de que precisa enviar o documento novamente."
          onConfirm={() => actions.reenviar.mutate(row)}
          loading={actions.reenviar.isPending}
        />
      )}
      {canTransition(row.status, "cancelado") && (
        <ConfirmAction
          label="Cancelar"
          title="Cancelar solicitação?"
          description="A solicitação será encerrada sem conclusão. Esta ação é terminal."
          onConfirm={() => actions.cancelar.mutate(row)}
          loading={actions.cancelar.isPending}
          variant="destructive"
        />
      )}
    </div>
  );
}

function ConfirmAction({
  label, title, description, onConfirm, loading, variant,
}: {
  label: string; title: string; description: string;
  onConfirm: () => void; loading?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant === "destructive" ? "outline" : "outline"} size="sm" disabled={loading}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
