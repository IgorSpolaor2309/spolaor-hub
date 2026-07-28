import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Pencil, ArrowUp, ArrowDown, Eye, EyeOff, Globe, Lock, RefreshCw, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ListSkeleton } from "@/components/sc/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { PublicTextsPopover } from "./PublicTextsPopover";
import { ClientPreviewSheet } from "./ClientPreviewSheet";
import { SyncVisibilityDialog } from "./SyncVisibilityDialog";
import { ProcessStepDialog } from "./ProcessStepDialog";
import { ProcessStepRequirementsEditor } from "./ProcessStepRequirementsEditor";

export function ProcessStepsEditor({ typeId, canEdit }: { typeId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<{ step: any; requirements: any[] } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todas" | "publicas" | "internas" | "com_reqs" | "sem_reqs">("todas");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const stepsQ = useQuery({
    queryKey: ["process-steps", typeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("process_steps")
        .select(
          "id, process_type_id, nome, descricao, ordem, departamento, prazo_dias, prazo_tipo, obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual, responsavel_padrao_id, nome_publico, descricao_publica, observacao_publica, is_demo, demo_batch_id, created_at, updated_at",
        )
        .eq("process_type_id", typeId).order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("process_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Etapa removida"); qc.invalidateQueries({ queryKey: ["process-steps", typeId] }); qc.invalidateQueries({ queryKey: ["process-types"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, ordem }: { id: string; ordem: number }) => {
      const { error } = await (supabase as any).from("process_steps").update({ ordem }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-steps", typeId] }),
  });

  const patchStep = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any).from("process_steps").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["process-steps", typeId] }),
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar"),
  });

  const bulk = useMutation({
    mutationFn: async ({ visible }: { visible: boolean }) => {
      const { data, error } = await (supabase as any).rpc("admin_bulk_set_model_visibility", {
        _process_type_id: typeId, _visible: visible, _include_requirements: true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`${data.etapas} etapa(s) e ${data.requisitos} requisito(s) atualizados`);
      qc.invalidateQueries({ queryKey: ["process-steps", typeId] });
      qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "process-step-requirements" });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  const steps = stepsQ.data ?? [];
  const visibleCount = useMemo(() => steps.filter((s: any) => s.visivel_cliente).length, [steps]);

  const reqCountsQ = useQuery({
    queryKey: ["process-steps-req-counts", typeId, steps.length],
    enabled: steps.length > 0,
    queryFn: async () => {
      const ids = steps.map((s: any) => s.id);
      const { data, error } = await (supabase as any).from("process_step_requirements")
        .select("process_step_id").in("process_step_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.process_step_id] = (map[r.process_step_id] ?? 0) + 1; });
      return map;
    },
  });
  const reqCount = (id: string) => reqCountsQ.data?.[id] ?? 0;

  const filteredSteps = useMemo(() => {
    const term = search.trim().toLowerCase();
    return steps.filter((s: any) => {
      if (term && !(`${s.nome} ${s.descricao ?? ""} ${s.nome_publico ?? ""}`.toLowerCase().includes(term))) return false;
      if (filter === "publicas" && !s.visivel_cliente) return false;
      if (filter === "internas" && s.visivel_cliente) return false;
      if (filter === "com_reqs" && reqCount(s.id) === 0) return false;
      if (filter === "sem_reqs" && reqCount(s.id) > 0) return false;
      return true;
    });
  }, [steps, search, filter, reqCountsQ.data]);

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const bulkSelected = useMutation({
    mutationFn: async ({ patch }: { patch: any }) => {
      const { error } = await (supabase as any).from("process_steps").update(patch).in("id", selectedIds);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selectedIds.length} etapa(s) atualizadas`);
      setSelected({});
      qc.invalidateQueries({ queryKey: ["process-steps", typeId] });
      qc.invalidateQueries({ queryKey: ["process-models-stats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha"),
  });

  return (
    <div className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Etapas</div>
        {steps.length > 0 && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Globe className="h-3 w-3" /> {visibleCount} de {steps.length} visíveis ao cliente
          </Badge>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {canEdit && steps.length > 0 && (
            <>
              <Button size="sm" variant="ghost" className="h-7" disabled={bulk.isPending}
                onClick={() => bulk.mutate({ visible: true })}>
                <Eye className="mr-1 h-3.5 w-3.5" /> Mostrar todas
              </Button>
              <Button size="sm" variant="ghost" className="h-7" disabled={bulk.isPending}
                onClick={() => bulk.mutate({ visible: false })}>
                <EyeOff className="mr-1 h-3.5 w-3.5" /> Ocultar todas
              </Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setSyncOpen(true)}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sincronizar
              </Button>
            </>
          )}
          {canEdit && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar etapa</Button>
              </DialogTrigger>
              {open && <ProcessStepDialog typeId={typeId} initial={editing} nextOrdem={steps.length} onDone={() => {
                setOpen(false); setEditing(null);
                qc.invalidateQueries({ queryKey: ["process-steps", typeId] });
                qc.invalidateQueries({ queryKey: ["process-types"] });
              }} />}
            </Dialog>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar etapa…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48" />
          {([
            ["todas", "Todas"],
            ["publicas", "Só públicas"],
            ["internas", "Só internas"],
            ["com_reqs", "Com requisitos"],
            ["sem_reqs", "Sem requisitos"],
          ] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}>
              <Badge variant={filter === k ? "default" : "outline"} className="cursor-pointer text-[10px]">{l}</Badge>
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {filteredSteps.length} de {steps.length} etapa(s)
          </span>
        </div>
      )}

      {canEdit && selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-indigo-200 bg-indigo-50 p-2 text-xs">
          <span className="font-medium">{selectedIds.length} selecionada(s)</span>
          <Button size="sm" variant="ghost" className="h-7" disabled={bulkSelected.isPending}
            onClick={() => bulkSelected.mutate({ patch: { visivel_cliente: true } })}>
            <Eye className="mr-1 h-3.5 w-3.5" /> Tornar públicas
          </Button>
          <Button size="sm" variant="ghost" className="h-7" disabled={bulkSelected.isPending}
            onClick={() => bulkSelected.mutate({ patch: { visivel_cliente: false } })}>
            <EyeOff className="mr-1 h-3.5 w-3.5" /> Tornar internas
          </Button>
          <Button size="sm" variant="ghost" className="h-7" disabled={bulkSelected.isPending}
            onClick={() => bulkSelected.mutate({ patch: { nome_publico: null, descricao_publica: null, observacao_publica: null } })}>
            Limpar textos públicos
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setSelected({})}>
            <X className="mr-1 h-3.5 w-3.5" /> Limpar seleção
          </Button>
        </div>
      )}

      {stepsQ.isLoading ? <ListSkeleton rows={4} />
        : steps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma etapa cadastrada.</p>
        : filteredSteps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma etapa corresponde ao filtro.</p>
        : (
          <ul className="divide-y">
            {filteredSteps.map((it: any) => {
              const idx = steps.findIndex((s: any) => s.id === it.id);
              return (
              <li key={it.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <Checkbox checked={!!selected[it.id]}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [it.id]: !!v }))} />
                  )}
                  <span className="w-8 text-xs text-muted-foreground">#{it.ordem}</span>
                  <span className="font-medium">{it.nome}</span>
                  {it.departamento && <Badge variant="outline">{it.departamento}</Badge>}
                  {it.obrigatoria && <Badge variant="secondary">Obrigatória</Badge>}
                  {it.exige_documento && <Badge className="bg-amber-100 text-amber-800">Exige doc.</Badge>}
                  {it.visivel_cliente
                    ? <Badge className="bg-blue-100 text-blue-800 gap-1"><Globe className="h-3 w-3" /> Visível</Badge>
                    : <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Interna</Badge>}
                  {it.prazo_dias != null && <span className="text-xs text-muted-foreground">{it.prazo_dias}d</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                      onClick={async () => {
                        const { data: reqs } = await (supabase as any).from("process_step_requirements")
                          .select(
                            "id, process_step_id, nome, descricao, observacao, obrigatorio, ordem, visivel_cliente, nome_publico, descricao_publica",
                          )
                          .eq("process_step_id", it.id).order("ordem");
                        setPreview({ step: it, requirements: reqs ?? [] });
                      }}>
                      <Eye className="h-3.5 w-3.5" /> Ver como cliente
                    </Button>
                    {canEdit && (
                      <>
                        <label className="ml-1 flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-[11px]" title="Mostrar esta etapa no Portal do Cliente">
                          <Switch checked={!!it.visivel_cliente}
                            onCheckedChange={(v) => patchStep.mutate({ id: it.id, patch: { visivel_cliente: v } })} />
                          Mostrar
                        </label>
                        <PublicTextsPopover
                          title="Textos públicos da etapa"
                          values={{ nome_publico: it.nome_publico, descricao_publica: it.descricao_publica, observacao_publica: it.observacao_publica }}
                          fields={[
                            { key: "nome_publico", label: "Nome público", placeholder: it.nome },
                            { key: "descricao_publica", label: "Descrição pública", textarea: true, placeholder: it.descricao ?? "" },
                            { key: "observacao_publica", label: "Observação pública", textarea: true },
                          ]}
                          onSave={(patch) => patchStep.mutateAsync({ id: it.id, patch })}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === 0}
                          onClick={() => { const prev = steps[idx - 1]; move.mutate({ id: it.id, ordem: prev.ordem }); move.mutate({ id: prev.id, ordem: it.ordem }); }}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === steps.length - 1}
                          onClick={() => { const next = steps[idx + 1]; move.mutate({ id: it.id, ordem: next.ordem }); move.mutate({ id: next.id, ordem: it.ordem }); }}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <DeleteButton onConfirm={() => remove.mutate(it.id)} />
                      </>
                    )}
                  </div>
                </div>
                <ProcessStepRequirementsEditor stepId={it.id} canEdit={canEdit} />
              </li>
            );})}
          </ul>
        )}

      {preview && (
        <ClientPreviewSheet open={!!preview} onOpenChange={(v) => !v && setPreview(null)}
          step={preview.step} requirements={preview.requirements} />
      )}
      {syncOpen && (
        <SyncVisibilityDialog typeId={typeId} onClose={() => setSyncOpen(false)} />
      )}
    </div>
  );
}
