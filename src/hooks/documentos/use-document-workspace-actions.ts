import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WorkspaceRow } from "@/lib/documentos/workspace-types";
import { WORKSPACE_QK } from "@/lib/documentos/workspace-types";

/**
 * Transições oficiais (Fase 2):
 *   aguardando → recebido | cancelado
 *   recebido   → concluido | reenviar | cancelado
 *   reenviar   → aguardando | recebido | cancelado
 *   concluido/cancelado: terminais
 */
function isValidTransition(from: string | null, to: string): boolean {
  if (!from) return false;
  const table: Record<string, string[]> = {
    aguardando: ["recebido", "cancelado"],
    recebido:   ["concluido", "reenviar", "cancelado"],
    reenviar:   ["aguardando", "recebido", "cancelado"],
  };
  return (table[from] ?? []).includes(to);
}

async function updateRequestStatus(id: string, next: string) {
  const { error } = await supabase
    .from("document_requests")
    .update({ status: next })
    .eq("id", id);
  if (error) throw error;
}

export function useWorkspaceActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: WORKSPACE_QK.root });
  };

  function guardTransition(row: WorkspaceRow, next: string) {
    if (row.item_kind !== "document_request") {
      throw new Error("Ação disponível apenas em solicitações.");
    }
    if (!isValidTransition(row.status, next)) {
      throw new Error(`Transição inválida (${row.status ?? "?"} → ${next}).`);
    }
  }

  const concluir = useMutation({
    mutationFn: async (row: WorkspaceRow) => {
      guardTransition(row, "concluido");
      await updateRequestStatus(row.item_id, "concluido");
    },
    onSuccess: () => { toast.success("Solicitação concluída."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const reenviar = useMutation({
    mutationFn: async (row: WorkspaceRow) => {
      guardTransition(row, "reenviar");
      await updateRequestStatus(row.item_id, "reenviar");
    },
    onSuccess: () => { toast.success("Reenvio solicitado ao cliente."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelar = useMutation({
    mutationFn: async (row: WorkspaceRow) => {
      guardTransition(row, "cancelado");
      await updateRequestStatus(row.item_id, "cancelado");
    },
    onSuccess: () => { toast.success("Solicitação cancelada."); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { concluir, reenviar, cancelar, canTransition: isValidTransition };
}
