import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fase 7 — leitura de feature flags do backend.
 * A flag é resolvida no servidor (`public.get_feature_flag`), nunca no cliente,
 * e o valor padrão seguro é `false`.
 */
export function useFeatureFlag(key: string) {
  const q = useQuery({
    queryKey: ["feature-flag", key],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_feature_flag", { _key: key });
      if (error) throw error;
      return data === true;
    },
  });

  return {
    enabled: q.data === true,
    isLoading: q.isLoading,
    error: q.error,
  };
}
