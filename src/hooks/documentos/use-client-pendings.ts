import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import {
  CLIENT_PENDINGS_QK,
  EMPTY_CLIENT_PENDING_COUNTS,
  type ClientPendingKind,
  type ClientPendingPayload,
} from "@/lib/documentos/client-pendings-types";

export type ClientPendingFilters = {
  page: number;
  pageSize: number;
  search: string;
  clientId: string | null;
  kind: ClientPendingKind | null;
  includeDemo: boolean;
};

/**
 * Fonte exclusiva da página "O que preciso fazer" (cliente).
 * Consome apenas public.client_list_pending_actions — sem SELECT direto em
 * document_requests / tax_guides. Filtros, contadores e paginação são server-side.
 */
export function useClientPendings(filters: ClientPendingFilters, enabled: boolean) {
  const debounced = useDebounce(filters.search, 300);

  const args = {
    _page: filters.page,
    _page_size: filters.pageSize,
    _search: debounced || undefined,
    _client_id: filters.clientId ?? undefined,
    _kind: filters.kind ?? undefined,
    _include_demo: filters.includeDemo,
  } as const;

  return useQuery({
    queryKey: CLIENT_PENDINGS_QK.list(args),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    queryFn: async (): Promise<ClientPendingPayload> => {
      const { data, error } = await supabase.rpc("client_list_pending_actions", args);
      if (error) throw error;
      const payload = (data ?? {}) as unknown as Partial<ClientPendingPayload>;
      return {
        rows: payload.rows ?? [],
        counts: payload.counts ?? EMPTY_CLIENT_PENDING_COUNTS,
        page: payload.page ?? 1,
        page_size: payload.page_size ?? filters.pageSize,
        total: payload.total ?? 0,
      };
    },
  });
}
