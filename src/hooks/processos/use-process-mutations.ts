import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mutations do detalhe do processo — mantêm o optimistic locking (updated_at)
 * e a serialização por `scope: { id: 'processo:<id>' }`.
 *
 * Extraído da rota apenas para reduzir o tamanho do arquivo. Nenhuma regra
 * (versão esperada, detecção de conflito, invalidação de cache) foi alterada.
 */
export const CONCURRENCY_CONFLICT = "__concurrency_conflict__";

export function useProcessMutations(id: string) {
  const qc = useQueryClient();
  const conflictToast = () =>
    toast.error("Este processo foi alterado enquanto você editava. Os dados mais recentes foram recarregados.");

  const updateProc = useMutation({
    scope: { id: `processo:${id}` },
    mutationFn: async ({ patch, expectedVersion }: { patch: any; expectedVersion: string | null | undefined }) => {
      let q = (supabase as any).from("company_processes").update(patch).eq("id", id);
      if (expectedVersion) q = q.eq("updated_at", expectedVersion);
      const { data, error } = await q.select("updated_at").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(CONCURRENCY_CONFLICT);
      return data.updated_at as string;
    },
    onSuccess: (newVersion) => {
      qc.setQueryData(["company-process", id], (prev: any) => prev ? { ...prev, updated_at: newVersion } : prev);
      qc.invalidateQueries({ queryKey: ["company-process", id] });
      qc.invalidateQueries({ queryKey: ["company-processes"] });
      qc.invalidateQueries({ queryKey: ["company-process-history", id] });
      qc.invalidateQueries({ queryKey: ["processos-indicadores"] });
    },
    onError: (e: any) => {
      if (e?.message === CONCURRENCY_CONFLICT) {
        conflictToast();
        qc.invalidateQueries({ queryKey: ["company-process", id] });
        qc.invalidateQueries({ queryKey: ["company-process-history", id] });
        return;
      }
      toast.error(e.message ?? "Falha ao atualizar");
    },
  });

  const updateStep = useMutation({
    scope: { id: `processo:${id}` },
    mutationFn: async ({ stepId, patch, expectedVersion }: { stepId: string; patch: any; expectedVersion: string | null | undefined }) => {
      let q = (supabase as any).from("company_process_steps").update(patch).eq("id", stepId);
      if (expectedVersion) q = q.eq("updated_at", expectedVersion);
      const { data, error } = await q.select("id, updated_at").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(CONCURRENCY_CONFLICT);
      return { stepId: data.id as string, updated_at: data.updated_at as string };
    },
    onSuccess: ({ stepId, updated_at }) => {
      qc.setQueryData(["company-process-steps", id], (prev: any[] | undefined) =>
        prev ? prev.map((r) => (r.id === stepId ? { ...r, updated_at } : r)) : prev,
      );
      qc.invalidateQueries({ queryKey: ["company-process-steps", id] });
      qc.invalidateQueries({ queryKey: ["company-processes"] });
      qc.invalidateQueries({ queryKey: ["company-process-history", id] });
      qc.invalidateQueries({ queryKey: ["processos-indicadores"] });
    },
    onError: (e: any) => {
      if (e?.message === CONCURRENCY_CONFLICT) {
        conflictToast();
        qc.invalidateQueries({ queryKey: ["company-process-steps", id] });
        qc.invalidateQueries({ queryKey: ["company-process-history", id] });
        return;
      }
      toast.error(e.message ?? "Falha ao atualizar etapa");
    },
  });

  const removeProc = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("company_processes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Processo excluído"); window.history.back(); },
    onError: (e: any) => toast.error(e.message),
  });

  return { updateProc, updateStep, removeProc };
}
