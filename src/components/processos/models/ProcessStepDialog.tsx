import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ProcessStepDialog({ typeId, initial, nextOrdem, onDone }: { typeId: string; initial: any; nextOrdem: number; onDone: () => void }) {
  const isEdit = !!initial;
  const [f, setF] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    ordem: initial?.ordem ?? nextOrdem,
    departamento: initial?.departamento ?? "",
    prazo_dias: initial?.prazo_dias ?? "",
    prazo_tipo: initial?.prazo_tipo ?? "abertura",
    responsavel_padrao_id: initial?.responsavel_padrao_id ?? "",
    obrigatoria: initial?.obrigatoria ?? true,
    exige_documento: initial?.exige_documento ?? false,
    visivel_cliente: initial?.visivel_cliente ?? false,
    pode_concluir_manual: initial?.pode_concluir_manual ?? true,
  });
  const collabsQ = useQuery({
    queryKey: ["processes-collabs"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators")
        .select("id, user_id, nome_completo").eq("status", "active").order("nome_completo");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.user_id);
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        process_type_id: typeId,
        nome: f.nome.trim(),
        descricao: f.descricao || null,
        ordem: Number(f.ordem) || 0,
        departamento: f.departamento || null,
        prazo_dias: f.prazo_dias === "" ? null : Number(f.prazo_dias),
        prazo_tipo: f.prazo_tipo,
        responsavel_padrao_id: f.responsavel_padrao_id || null,
        obrigatoria: f.obrigatoria,
        exige_documento: f.exige_documento,
        visivel_cliente: f.visivel_cliente,
        pode_concluir_manual: f.pode_concluir_manual,
      };
      if (isEdit) {
        const { error } = await (supabase as any).from("process_steps").update(payload).eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("process_steps").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(isEdit ? "Etapa atualizada" : "Etapa criada"); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });
  return (
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{isEdit ? "Editar etapa" : "Nova etapa"}</DialogTitle></DialogHeader>
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label>Nome *</Label>
          <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Protocolar Junta" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Ordem</Label>
            <Input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as any })} />
          </div>
          <div className="space-y-1.5">
            <Label>Departamento</Label>
            <Input value={f.departamento} onChange={(e) => setF({ ...f, departamento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Prazo (dias)</Label>
            <Input type="number" value={f.prazo_dias} onChange={(e) => setF({ ...f, prazo_dias: e.target.value as any })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Contagem do prazo</Label>
            <Select value={f.prazo_tipo} onValueChange={(v) => setF({ ...f, prazo_tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="abertura">A partir da abertura do processo</SelectItem>
                <SelectItem value="anterior">Após a conclusão da etapa anterior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Responsável padrão</Label>
            <Select value={f.responsavel_padrao_id || "__none__"} onValueChange={(v) => setF({ ...f, responsavel_padrao_id: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Nenhum —</SelectItem>
                {(collabsQ.data ?? []).map((c: any) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["obrigatoria", "Obrigatória"],
            ["exige_documento", "Exige documento"],
            ["visivel_cliente", "Visível ao cliente"],
            ["pode_concluir_manual", "Pode concluir manualmente"],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Checkbox checked={(f as any)[k]} onCheckedChange={(v) => setF({ ...f, [k]: !!v } as any)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!f.nome.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar etapa"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
