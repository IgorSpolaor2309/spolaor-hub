import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { CATEGORIAS } from "./shared";

export function ProcessTypeEditor({ initial, onDone }: { initial: any; onDone: () => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    nome: initial?.nome ?? "",
    categoria: initial?.categoria ?? "outro",
    descricao: initial?.descricao ?? "",
    cor: initial?.cor ?? "#3b82f6",
    icone: initial?.icone ?? "",
    status: initial?.status ?? "ativo",
    ordem: initial?.ordem ?? 0,
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        nome: f.nome.trim(),
        categoria: f.categoria || null,
        descricao: f.descricao || null,
        cor: f.cor || null,
        icone: f.icone || null,
        status: f.status,
        ordem: Number(f.ordem) || 0,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("process_types").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("process_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Modelo atualizado" : "Modelo criado"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{isEdit ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Abertura de Empresa" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input type="color" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label>Ícone (opcional)</Label>
            <Input value={f.icone} onChange={(e) => setF({ ...f, icone: e.target.value })} placeholder="Ex.: Briefcase" />
          </div>
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as any })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!f.nome.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar modelo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function DeleteTypeButton({ id, onDone }: { id: string; onDone: () => void }) {
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("process_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Modelo excluído"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao excluir"),
  });
  return <DeleteButton onConfirm={() => m.mutate()} />;
}
