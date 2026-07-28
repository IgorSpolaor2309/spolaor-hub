import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import type { PortalPayload } from "@/lib/documentos/portal-types";
import { PORTAL_QK } from "@/lib/documentos/portal-types";
import type { ClientWorkspaceFilters } from "./use-client-workspace-filters";

/**
 * Fonte exclusiva da listagem do Portal do Cliente.
 * Consome apenas list_client_document_workspace_paginated (Fase 3).
 * Nada de queries diretas em document_requests/documents aqui.
 */
export function useClientDocumentPortal(filters: ClientWorkspaceFilters, enabled: boolean) {
  const debounced = useDebounce(filters.search, 300);

  const args = {
    _section: filters.section,
    _page: filters.page,
    _page_size: filters.pageSize,
    _search: debounced || undefined,
    _client_id: filters.clientId ?? undefined,
    _competencia: filters.competencia ?? undefined,
    _include_demo: filters.includeDemo,
  } as const;

  return useQuery({
    queryKey: PORTAL_QK.list(args),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<PortalPayload> => {
      const { data, error } = await supabase.rpc("list_client_document_workspace_paginated", args);
      if (error) throw error;
      const payload = (data ?? {}) as unknown as Partial<PortalPayload>;
      return {
        rows: payload.rows ?? [],
        counts: payload.counts ?? {
          aguardando_voce: 0, aguardando_contabilidade: 0, em_analise: 0,
          precisa_reenviar: 0, concluidos: 0, cancelados: 0, todos: 0,
        },
        page: payload.page ?? 1,
        page_size: payload.page_size ?? filters.pageSize,
        total: payload.total ?? 0,
      };
    },
  });
}

/** Empresas visíveis para o usuário — usado quando ele tem mais de uma. */
export function usePortalClients(enabled: boolean) {
  return useQuery({
    queryKey: PORTAL_QK.clients,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia")
        .is("deleted_at", null)
        .neq("status", "inactive")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });
}
