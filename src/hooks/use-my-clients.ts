import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";

const STORAGE_KEY = "sc.selectedClientId";
export const ALL_COMPANIES = "__all__";

export type MyClient = {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  documento: string | null;
  status?: string | null;
};

/**
 * Hook usado em telas do cliente. Retorna todas as empresas/CNPJs
 * vinculadas à conta (RLS via `user_has_client_access` filtra).
 *
 * Inclui seleção persistente em localStorage e opção "Todas as empresas".
 */
export function useMyClients() {
  const { userId, role } = useCurrentUser();
  const enabled = !!userId;

  const query = useQuery({
    queryKey: ["my-clients-multi", userId, role],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento, status, owner_profile_id")
        .order("razao_social");
      if (error) throw error;
      const rows = (data ?? []) as Array<MyClient & { owner_profile_id: string | null }>;
      // Para o cliente, RLS já filtra; mas se for colaborador/admin estamos
      // em outra tela. Este hook é destinado ao perfil "client".
      if (role === "client" && userId) {
        // Une legado (owner_profile_id) com novos vínculos visíveis (RLS já permitiu).
        const ids = new Set<string>();
        const out: MyClient[] = [];
        for (const r of rows) {
          if (ids.has(r.id)) continue;
          ids.add(r.id);
          out.push(r);
        }
        return out;
      }
      return rows as MyClient[];
    },
  });

  const clients = query.data ?? [];
  const [selectedId, setSelectedIdState] = useState<string>(() => {
    if (typeof window === "undefined") return ALL_COMPANIES;
    return window.localStorage.getItem(STORAGE_KEY) ?? ALL_COMPANIES;
  });

  // Garante que a seleção seja válida quando a lista carrega.
  useEffect(() => {
    if (!clients.length) return;
    if (selectedId !== ALL_COMPANIES && !clients.some((c) => c.id === selectedId)) {
      const next = clients.length === 1 ? clients[0].id : ALL_COMPANIES;
      setSelectedIdState(next);
      try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
    }
  }, [clients, selectedId]);

  const setSelectedId = (v: string) => {
    setSelectedIdState(v);
    try { window.localStorage.setItem(STORAGE_KEY, v); } catch { /* noop */ }
  };

  const selectedIds = selectedId === ALL_COMPANIES
    ? clients.map((c) => c.id)
    : clients.some((c) => c.id === selectedId) ? [selectedId] : [];

  return {
    clients,
    selectedId,
    setSelectedId,
    selectedIds,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
