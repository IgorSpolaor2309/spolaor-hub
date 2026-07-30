import { createFileRoute } from "@tanstack/react-router";
import { ListSkeleton, InlineLoading } from "@/components/sc/Skeletons";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/sc/EmptyState";
import { useCurrentUser } from "@/hooks/use-current-user";
import { GitBranch, Plus, Pencil, ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import { DemoBadge } from "@/components/sc/DemoBadge";
import { DemoFilter, matchesDemoFilter, type DemoFilterValue } from "@/components/sc/DemoFilter";
import { CAT_LABEL } from "@/components/processos/models/shared";
import { StatCard } from "@/components/processos/models/StatCard";
import { ProcessTypeEditor, DeleteTypeButton } from "@/components/processos/models/ProcessTypeEditor";
import { ProcessStepsEditor } from "@/components/processos/models/ProcessStepsEditor";
import { DuplicateProcessTypeDialog } from "@/components/processos/models/DuplicateProcessTypeDialog";
import { ImportConfigDialog } from "@/components/processos/models/ImportConfigDialog";

export const Route = createFileRoute("/_authenticated/processos-modelos")({
  component: ProcessTypesPage,
});

function ProcessTypesPage() {
  const { role, loading } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"nome" | "mais_usados" | "recentes" | "antigos" | "etapas">("nome");
  const [dupOf, setDupOf] = useState<any>(null);
  const [importInto, setImportInto] = useState<any>(null);
  const [demoFilter, setDemoFilter] = useState<DemoFilterValue>("real");

  const typesQ = useQuery({
    queryKey: ["process-types"],
    enabled: !loading && (role === "admin" || role === "collaborator"),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("process_types")
        .select(
          "id, nome, categoria, descricao, cor, icone, status, ordem, is_demo, demo_batch_id, created_at, updated_at, process_steps(id)",
        )
        .order("ordem").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const statsQ = useQuery({
    queryKey: ["process-models-stats"],
    enabled: !loading && (role === "admin" || role === "collaborator"),
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_process_models_stats");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const statsMap = useMemo(() => {
    const m = new Map<string, any>();
    (statsQ.data ?? []).forEach((s: any) => m.set(s.process_type_id, s));
    return m;
  }, [statsQ.data]);

  const sortedTypes = useMemo(() => {
    const arr = [...(typesQ.data ?? [])].filter((t: any) => matchesDemoFilter(t, demoFilter));
    const get = (t: any) => statsMap.get(t.id) ?? {};
    switch (sortBy) {
      case "mais_usados": arr.sort((a, b) => (get(b).processos_ativos ?? 0) - (get(a).processos_ativos ?? 0)); break;
      case "recentes": arr.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")); break;
      case "antigos": arr.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "")); break;
      case "etapas": arr.sort((a, b) => (get(b).etapas_total ?? 0) - (get(a).etapas_total ?? 0)); break;
      default: arr.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
    }
    return arr;
  }, [typesQ.data, statsMap, sortBy, demoFilter]);

  const totals = useMemo(() => {
    const types = typesQ.data ?? [];
    const stats = statsQ.data ?? [];
    const sum = (k: string) => stats.reduce((a: number, s: any) => a + (s[k] ?? 0), 0);
    return {
      modelos: types.length,
      ativos: types.filter((t: any) => t.status === "ativo").length,
      inativos: types.filter((t: any) => t.status !== "ativo").length,
      etapas: sum("etapas_total"),
      etapas_publicas: sum("etapas_publicas"),
      requisitos: sum("requisitos_total"),
      requisitos_publicos: sum("requisitos_publicos"),
      processos_ativos: sum("processos_ativos"),
    };
  }, [typesQ.data, statsQ.data]);

  if (loading) return <InlineLoading />;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Acesso restrito" description="Apenas administradores e colaboradores." />;
  }
  const isAdmin = role === "admin";

  return (
    <div>
      <PageHeader
        title="Modelos de processo"
        description="Cadastre tipos de processo e suas etapas padrão."
        action={isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Novo modelo</Button>
            </DialogTrigger>
            {open && <ProcessTypeEditor initial={editing} onDone={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["process-types"] }); qc.invalidateQueries({ queryKey: ["process-models-stats"] }); }} />}
          </Dialog>
        )}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Modelos" value={totals.modelos} />
        <StatCard label="Ativos" value={totals.ativos} tone="emerald" />
        <StatCard label="Inativos" value={totals.inativos} tone="zinc" />
        <StatCard label="Etapas" value={totals.etapas} />
        <StatCard label="Etapas públicas" value={totals.etapas_publicas} tone="blue" />
        <StatCard label="Requisitos" value={totals.requisitos} />
        <StatCard label="Requisitos públicos" value={totals.requisitos_publicos} tone="blue" />
        <StatCard label="Processos ativos" value={totals.processos_ativos} tone="indigo" />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">Ordenar por</Label>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nome">Nome (A→Z)</SelectItem>
            <SelectItem value="mais_usados">Mais utilizados</SelectItem>
            <SelectItem value="etapas">Maior nº de etapas</SelectItem>
            <SelectItem value="recentes">Mais recentes</SelectItem>
            <SelectItem value="antigos">Mais antigos</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><DemoFilter value={demoFilter} onChange={setDemoFilter} /></div>
      </div>

      <Card className="p-2">
        {typesQ.isLoading ? <ListSkeleton rows={4} />
          : sortedTypes.length === 0 ? <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Nenhum modelo cadastrado" description="Crie o primeiro tipo de processo." />
          : (
            <ul className="divide-y">
              {sortedTypes.map((t: any) => {
                const st = statsMap.get(t.id) ?? {};
                return (
                <li key={t.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                      onClick={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}>
                      {expanded[t.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                    {t.cor && <span className="h-3 w-3 rounded-full border" style={{ background: t.cor }} />}
                    <span className="font-medium">{t.nome}</span>
                    {t.is_demo && <DemoBadge compact />}
                    {t.categoria && <Badge variant="outline">{CAT_LABEL[t.categoria] ?? t.categoria}</Badge>}
                    <Badge className={t.status === "ativo" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-700"}>
                      {t.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      · {st.etapas_total ?? t.process_steps?.length ?? 0} etapas
                      {st.etapas_publicas != null && ` (${st.etapas_publicas} públicas)`}
                      {" · "}{st.processos_ativos ?? 0} processos ativos
                    </span>
                    {st.ultima_sincronizacao && (
                      <span className="text-[10px] text-muted-foreground" title="Última sincronização com processos">
                        · sync {new Date(st.ultima_sincronizacao).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" title="Duplicar modelo"
                            onClick={() => setDupOf(t)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" title="Importar visibilidade de outro modelo"
                            onClick={() => setImportInto(t)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DeleteTypeButton id={t.id} onDone={() => { qc.invalidateQueries({ queryKey: ["process-types"] }); qc.invalidateQueries({ queryKey: ["process-models-stats"] }); }} />
                        </>
                      )}
                    </div>
                  </div>
                  {expanded[t.id] && <ProcessStepsEditor typeId={t.id} canEdit={isAdmin} />}
                </li>
              );})}
            </ul>
          )}
      </Card>

      {dupOf && <DuplicateProcessTypeDialog source={dupOf} onClose={(newId) => {
        setDupOf(null);
        qc.invalidateQueries({ queryKey: ["process-types"] });
        qc.invalidateQueries({ queryKey: ["process-models-stats"] });
        if (newId) setExpanded((e) => ({ ...e, [newId]: true }));
      }} />}
      {importInto && <ImportConfigDialog target={importInto} allTypes={typesQ.data ?? []} onClose={() => {
        setImportInto(null);
        qc.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && (q.queryKey[0] === "process-steps" || q.queryKey[0] === "process-step-requirements" || q.queryKey[0] === "process-models-stats") });
      }} />}
    </div>
  );
}
