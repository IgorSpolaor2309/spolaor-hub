import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function DuplicateProcessTypeDialog({ source, onClose }: { source: any; onClose: (newId?: string) => void }) {
  const [nome, setNome] = useState(source.nome + " (cópia)");
  const [descricao, setDescricao] = useState<string>(source.descricao ?? "");
  const [status, setStatus] = useState<string>("ativo");
  const [openAfter, setOpenAfter] = useState(true);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_duplicate_process_type", {
        _source: source.id, _nome: nome, _descricao: descricao || null, _status: status,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (newId: string) => { toast.success("Modelo duplicado com sucesso"); onClose(openAfter ? newId : undefined); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao duplicar"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicar modelo</DialogTitle>
          <DialogDescription>
            Cria uma cópia independente de "{source.nome}", incluindo etapas, prazos, responsáveis, textos públicos e requisitos. Processos, documentos e histórico não são copiados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="space-y-1"><Label>Nome do novo modelo *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1"><Label>Descrição</Label><Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="space-y-1"><Label>Status inicial</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={openAfter} onCheckedChange={(v) => setOpenAfter(!!v)} />
            Abrir o novo modelo automaticamente
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()}>Cancelar</Button>
          <Button disabled={!nome.trim() || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Duplicando…" : "Duplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
