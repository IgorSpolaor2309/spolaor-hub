import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  HISTORY_QK,
  type ClientFileVersion,
  type StaffFileVersion,
} from "@/lib/documentos/history-types";

/**
 * Fase 6 — histórico 1:N de versões de uma solicitação.
 * Carregado apenas quando o Sheet de detalhe abre (nunca na listagem).
 * A whitelist de colunas vive na RPC; o handler não filtra nada.
 */
export function useStaffRequestFiles(requestId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: HISTORY_QK.staff(requestId ?? "none"),
    enabled: Boolean(requestId) && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<StaffFileVersion[]> => {
      const { data, error } = await supabase.rpc("list_document_request_files_staff", {
        _request_id: requestId!,
      });
      if (error) throw error;
      const payload = data as unknown as { items?: StaffFileVersion[] } | null;
      return payload?.items ?? [];
    },
  });
}

export function useClientRequestFiles(requestId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: HISTORY_QK.client(requestId ?? "none"),
    enabled: Boolean(requestId) && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<ClientFileVersion[]> => {
      const { data, error } = await supabase.rpc("list_document_request_files_client", {
        _request_id: requestId!,
      });
      if (error) throw error;
      const payload = data as unknown as { items?: ClientFileVersion[] } | null;
      return payload?.items ?? [];
    },
  });
}
