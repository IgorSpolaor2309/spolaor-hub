import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Deriva a chave estável para `useProfilesMap`: dedup + filtragem de vazios
 * + ordenação. Extraída para permitir testes unitários sem React.
 */
export function profileMapKey(ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((v): v is string => !!v))).sort();
}

/**
 * Resolve nomes de vários profile ids em UMA única consulta.
 * Dedup dos ids + cache TanStack Query. Retorna `Record<id, full_name>`.
 * Não retorna e-mails nem outros campos sensíveis.
 */
export function useProfilesMap(ids: (string | null | undefined)[]) {
  const unique = profileMapKey(ids);
  const key = unique.join(",");
  return useQuery({
    queryKey: ["profiles-map", key],
    enabled: unique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", unique);
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name ?? null; });
      return map;
    },
  });
}

