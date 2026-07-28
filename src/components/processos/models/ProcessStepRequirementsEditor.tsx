import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Globe, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { PublicTextsPopover } from "./PublicTextsPopover";

export function ProcessStepRequirementsEditor({ stepId, canEdit }: { stepId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [obrigatorio, setObrigatorio] = useState(true);

  const q = useQuery({
    queryKey: ["process-step-requirements", stepId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("process_step_requirements")
        .select(
          "id, process_step_id, nome, descricao, observacao, obrigatorio, ordem, visivel_cliente, nome_publico, descricao_publica, created_at, updated_at",
        )
        .eq("process_step_id", stepId).order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["process-step-requirements", stepId] });

  const add = useMutation({
    mutationFn: async () => {
      const nextOrdem = (q.data ?? []).length;
      const { error } = await (supabase as any).from("process_step_requirements").insert({
        process_step_id: stepId, nome: nome.trim(), descricao: descricao || null,
        obrigatorio, ordem: nextOrdem,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito criado"); setNome(""); setDescricao(""); setObrigatorio(true); setShowForm(false); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const toggleObrig = useMutation({
    mutationFn: async ({ id, obrigatorio }: { id: string; obrigatorio: boolean }) => {
      const { error } = await (supabase as any).from("process_step_requirements").update({ obrigatorio }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const patch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("process_step_requirements").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("process_step_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Requisito removido"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const items = q.data ?? [];
  const visibleCount = items.filter((r: any) => r.visivel_cliente).length;
  return (
    <div className="mt-2 ml-8 rounded border-l-2 bg-muted/20 p-2 pl-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">
          Requisitos documentais ({items.length})
          {items.length > 0 && <span className="ml-2 text-[10px]">· {visibleCount} visível(is) ao cliente</span>}
        </div>
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3 w-3" /> Adicionar
          </Button>
        )}
      </div>
      {items.length === 0 && !showForm && <p className="text-[11px] text-muted-foreground">Nenhum requisito cadastrado.</p>}
      {items.length > 0 && (
        <ul className="mb-1 space-y-1">
          {items.map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span>{r.nome}</span>
              {canEdit ? (
                <button type="button" onClick={() => toggleObrig.mutate({ id: r.id, obrigatorio: !r.obrigatorio })}>
                  <Badge variant={r.obrigatorio ? "secondary" : "outline"} className="cursor-pointer text-[10px]">
                    {r.obrigatorio ? "Obrigatório" : "Opcional"}
                  </Badge>
                </button>
              ) : (
                <Badge variant={r.obrigatorio ? "secondary" : "outline"} className="text-[10px]">{r.obrigatorio ? "Obrigatório" : "Opcional"}</Badge>
              )}
              {r.visivel_cliente
                ? <Badge className="bg-blue-100 text-blue-800 gap-1 text-[10px]"><Globe className="h-2.5 w-2.5" /> Visível</Badge>
                : <Badge variant="outline" className="gap-1 text-[10px]"><Lock className="h-2.5 w-2.5" /> Interna</Badge>}
              {r.descricao && <span className="text-muted-foreground">— {r.descricao}</span>}
              {canEdit && (
                <div className="ml-auto flex items-center gap-1">
                  <label className="flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10px]" title="Mostrar ao cliente">
                    <Switch checked={!!r.visivel_cliente}
                      onCheckedChange={(v) => patch.mutate({ id: r.id, patch: { visivel_cliente: v } })} />
                    Mostrar
                  </label>
                  <PublicTextsPopover
                    title="Textos públicos do requisito"
                    values={{ nome_publico: r.nome_publico, descricao_publica: r.descricao_publica }}
                    fields={[
                      { key: "nome_publico", label: "Nome público", placeholder: r.nome },
                      { key: "descricao_publica", label: "Descrição pública", textarea: true, placeholder: r.descricao ?? "" },
                    ]}
                    onSave={(p) => patch.mutateAsync({ id: r.id, patch: p })}
                  />
                  <DeleteButton onConfirm={() => remove.mutate(r.id)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {showForm && canEdit && (
        <div className="mt-2 grid gap-2 rounded border bg-background p-2">
          <Input placeholder="Nome do documento (ex.: Contrato social assinado)" value={nome} onChange={(e) => setNome(e.target.value)} className="h-8" />
          <Input placeholder="Descrição/orientação (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-8" />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={obrigatorio} onCheckedChange={(v) => setObrigatorio(!!v)} /> Obrigatório
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={!nome.trim() || add.isPending} onClick={() => add.mutate()}>Salvar</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
