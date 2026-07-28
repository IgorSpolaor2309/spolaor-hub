import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function SyncVisibilityDialog({ typeId, onClose }: { typeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"only_missing" | "overwrite_all">("only_missing");
  const previewQ = useQuery({
    queryKey: ["sync-visibility-preview", typeId, mode],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_sync_process_visibility", {
        _process_type_id: typeId, _mode: mode, _dry_run: true,
      });
      if (error) throw error;
      return data;
    },
  });
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_sync_process_visibility", {
        _process_type_id: typeId, _mode: mode, _dry_run: false,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sincronizado: ${data.etapas_afetadas} etapas, ${data.requisitos_afetados} requisitos em ${data.clientes_afetados} cliente(s).`);
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey[0] === "client-process-detail" || q.queryKey[0] === "processos-list") });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao sincronizar"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sincronizar visibilidade com processos abertos</DialogTitle>
          <DialogDescription>
            Aplica as configurações públicas atuais do modelo aos processos em andamento (concluídos e cancelados são ignorados).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2 rounded border p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" checked={mode === "only_missing"} onChange={() => setMode("only_missing")} className="mt-0.5" />
              <span>
                <b>Somente campos vazios</b>
                <span className="block text-xs text-muted-foreground">
                  Preserva textos personalizados feitos direto no processo. Apenas promove etapas/requisitos a "visível" quando o modelo estiver marcado.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" checked={mode === "overwrite_all"} onChange={() => setMode("overwrite_all")} className="mt-0.5" />
              <span>
                <b>Sobrescrever tudo</b>
                <span className="block text-xs text-muted-foreground">
                  Iguala 100% ao modelo. Textos e visibilidade personalizados serão substituídos.
                </span>
              </span>
            </label>
          </div>
          <div className="rounded border bg-muted/30 p-3 text-sm">
            {previewQ.isLoading ? "Calculando impacto…" : previewQ.error ? "Falha ao pré-visualizar." : (
              <>
                <div><b>{previewQ.data?.etapas_afetadas ?? 0}</b> etapa(s) serão alteradas</div>
                <div><b>{previewQ.data?.requisitos_afetados ?? 0}</b> requisito(s) serão alterados</div>
                <div><b>{previewQ.data?.clientes_afetados ?? 0}</b> cliente(s) receberão registro no histórico</div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={apply.isPending || previewQ.isLoading} onClick={() => apply.mutate()}>
            {apply.isPending ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
