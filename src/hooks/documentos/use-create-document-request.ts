import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WORKSPACE_QK } from "@/lib/documentos/workspace-types";
import type {
  CreateRequestInput, DuplicateHit, EligiblePayload,
} from "@/lib/documentos/create-request-types";

const EMPTY: EligiblePayload = { rows: [], total: 0, page: 1, page_size: 20 };

/** Itens do checklist elegíveis para virar solicitação (aba "Precisa solicitar"). */
export function useEligibleChecklistItems(
  params: { clientId: string | null; competencia: string | null; search: string; includeDemo: boolean; page: number; pageSize: number },
  enabled: boolean,
) {
  const args = {
    _client_id: params.clientId ?? undefined,
    _competencia: params.competencia ?? undefined,
    _search: params.search || undefined,
    _include_demo: params.includeDemo,
    _page: params.page,
    _page_size: params.pageSize,
  };
  return useQuery({
    queryKey: ["doc-workspace", "eligible", args],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async (): Promise<EligiblePayload> => {
      const { data, error } = await supabase.rpc("workspace_checklist_precisa_solicitar_list", args);
      if (error) throw error;
      const payload = (data ?? {}) as unknown as Partial<EligiblePayload>;
      return {
        rows: payload.rows ?? EMPTY.rows,
        total: payload.total ?? 0,
        page: payload.page ?? params.page,
        page_size: payload.page_size ?? params.pageSize,
      };
    },
  });
}

/** Empresas da carteira (reaproveita a mesma lista dos filtros). */
export function useWorkspaceClients(enabled = true) {
  return useQuery({
    queryKey: WORKSPACE_QK.clientsBrief,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia")
        .is("deleted_at", null)
        .order("razao_social", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Responsáveis (mesma fonte usada no Checklist). */
export function useRequestResponsibles(clientId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["doc-workspace", "responsibles", clientId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase.rpc("list_checklist_responsibles", {
        _client_id: clientId ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.profile_id,
        nome: r.full_name || r.email || "Sem nome",
      }));
    },
  });
}

/** Alerta (não bloqueia) de possíveis duplicidades. */
export function useDuplicateCheck(
  params: { clientId: string | null; competencia: string | null; categoria: string | null; tipo: string | null },
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["doc-workspace", "dup-check", params],
    enabled: enabled && !!params.clientId && (!!params.categoria || !!params.tipo),
    staleTime: 10_000,
    queryFn: async (): Promise<DuplicateHit[]> => {
      const { data, error } = await supabase.rpc("staff_check_duplicate_document_request", {
        _client_id: params.clientId!,
        _competencia: params.competencia ?? undefined,
        _categoria: params.categoria ?? undefined,
        _tipo: params.tipo ?? undefined,
      });
      if (error) throw error;
      const payload = (data ?? {}) as unknown as { possiveis_duplicatas?: DuplicateHit[] };
      return payload.possiveis_duplicatas ?? [];
    },
  });
}

/** Criação da solicitação (transacional no servidor). */
export function useCreateDocumentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateRequestInput) => {
      const { data, error } = await supabase.rpc("staff_create_document_request", {
        _client_id: input.client_id,
        _titulo: input.titulo,
        _descricao: input.descricao ?? undefined,
        _competencia: input.competencia ?? undefined,
        _categoria: input.categoria ?? undefined,
        _tipo_solicitacao: input.tipo_solicitacao ?? undefined,
        _departamento: input.departamento ?? undefined,
        _prazo: input.prazo ?? undefined,
        _urgencia: input.urgencia ?? "normal",
        _responsavel_profile_id: input.responsavel_profile_id ?? undefined,
        _observacoes_internas: input.observacoes_internas ?? undefined,
        _checklist_item_id: input.checklist_item_id ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { id: string; titulo: string };
    },
    onSuccess: () => {
      toast.success("Solicitação criada e enviada ao cliente.");
      qc.invalidateQueries({ queryKey: WORKSPACE_QK.root });
      qc.invalidateQueries({ queryKey: ["checklist-items"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
