import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  NeedToRequestDiagnostic, WorkspacePayload,
} from "@/lib/documentos/workspace-types";
import { RPC_TABS, WORKSPACE_QK } from "@/lib/documentos/workspace-types";
import type { WorkspaceFilters } from "./use-document-workspace-filters";

/**
 * Consome list_document_workspace_paginated respeitando o contrato da Fase 3.
 * Nada de select("*"), nada de contagens client-side, nada de lógica de
 * action_owner ou deduplicação no frontend.
 */
export function useDocumentWorkspace(filters: WorkspaceFilters, enabled: boolean) {
  const debouncedSearch = useDebounce(filters.search, 300);

  const rpcTab = RPC_TABS.includes(filters.tab as (typeof RPC_TABS)[number])
    ? filters.tab
    : "todos"; // "precisa_solicitar" reaproveita counts globais e usa a lista "todos"

  const args = {
    _tab: rpcTab,
    _page: filters.page,
    _page_size: filters.pageSize,
    _search: debouncedSearch || undefined,
    _client_id: filters.clientId ?? undefined,
    _competencia: filters.competencia ?? undefined,
    _categoria: filters.categoria ?? undefined,
    _tipo: filters.tipo ?? undefined,
    _departamento: filters.departamento ?? undefined,
    _status: filters.status ?? undefined,
    _action_owner: filters.actionOwner ?? undefined,
    _responsavel_id: filters.responsavelId ?? undefined,
    _origem: filters.origem ?? undefined,
    _prazo_from: filters.prazoFrom ?? undefined,
    _prazo_to: filters.prazoTo ?? undefined,
    _validade_from: filters.validadeFrom ?? undefined,
    _validade_to: filters.validadeTo ?? undefined,
    _tem_documento: filters.temDocumento ?? undefined,
    _tem_vinculo: filters.temVinculo ?? undefined,
    _somente_meus: filters.somenteMeus || undefined,
    _include_demo: filters.demo === "all" ? true : filters.demo === "demo" ? true : false,
    _demo_batch_id: filters.demoBatchId ?? undefined,
  } as const;

  return useQuery({
    queryKey: WORKSPACE_QK.list({ ...args, _tab_ui: filters.tab, _demo: filters.demo }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<WorkspacePayload> => {
      const { data, error } = await supabase.rpc("list_document_workspace_paginated", args);
      if (error) throw error;
      // A RPC devolve jsonb. Fazemos apenas um cast controlado — nada de as any.
      const payload = (data ?? {}) as unknown as Partial<WorkspacePayload>;
      // "demo" filtro: quando o usuário pediu SOMENTE demo, escondemos itens reais.
      let rows = payload.rows ?? [];
      if (filters.demo === "demo") rows = rows.filter((r) => r.is_demo);
      return {
        rows,
        counts: payload.counts ?? {
          aguardando_cliente: 0, aguardando_equipe: 0, recebidos: 0, reenviar: 0,
          concluidos: 0, vencendo: 0, vencidos: 0, vinculados: 0, sem_vinculo: 0, todos: 0,
        },
        page: payload.page ?? 1,
        page_size: payload.page_size ?? filters.pageSize,
        total: payload.total ?? 0,
      };
    },
  });
}

export function useNeedToRequestDiagnostic(clientId: string | null, includeDemo: boolean, enabled: boolean) {
  return useQuery({
    queryKey: WORKSPACE_QK.needToRequest(clientId, includeDemo),
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<NeedToRequestDiagnostic> => {
      const { data, error } = await supabase.rpc("workspace_checklist_precisa_solicitar_count", {
        _client_id: clientId ?? undefined,
        _include_demo: includeDemo,
      });
      if (error) throw error;
      return data as unknown as NeedToRequestDiagnostic;
    },
  });
}
