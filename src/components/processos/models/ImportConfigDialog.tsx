import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ImportConfigDialog({ target, allTypes, onClose }: { target: any; allTypes: any[]; onClose: () => void }) {
  const [sourceId, setSourceId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const preview = useQuery({
    queryKey: ["import-config-preview", sourceId, target.id],
    enabled: false,
    queryFn: async () => null,
  });
  const apply = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_import_model_config", {
        _source: sourceId, _target: target.id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Importado: ${data.etapas_atualizadas} etapas e ${data.requisitos_atualizados} requisitos.${data.etapas_sem_correspondencia ? ` ${data.etapas_sem_correspondencia} etapa(s) sem correspondência foram ignoradas.` : ""}`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao importar"),
  });
  void preview;
  const options = allTypes.filter((t: any) => t.id !== target.id);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar configuração pública</DialogTitle>
          <DialogDescription>
            Copia apenas visibilidade e textos públicos (nome, descrição, observação) das etapas e requisitos de outro modelo para "{target.nome}". Ordem, prazos, responsáveis e etapas sem correspondência não são alterados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Modelo de origem</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {options.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            O casamento é feito pelo nome da etapa e do requisito (sem diferenciar maiúsculas). Nenhuma etapa é adicionada, removida ou reordenada.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={!sourceId || apply.isPending} onClick={() => setConfirmOpen(true)}>
            Importar
          </Button>
        </DialogFooter>
        {confirmOpen && (
          <Dialog open onOpenChange={(v) => !v && setConfirmOpen(false)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirmar importação</DialogTitle>
                <DialogDescription>
                  Isso vai sobrescrever a visibilidade e os textos públicos das etapas e requisitos de "{target.nome}" que tiverem nome equivalente no modelo de origem. Continuar?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
                <Button disabled={apply.isPending} onClick={() => { setConfirmOpen(false); apply.mutate(); }}>
                  {apply.isPending ? "Aplicando…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
