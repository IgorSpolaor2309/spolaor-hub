import { createFileRoute, Link } from "@tanstack/react-router";
import { ListSkeleton, InlineLoading } from "@/components/sc/Skeletons";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/sc/EmptyState";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { useCurrentUser } from "@/hooks/use-current-user";
import { clientLabel } from "@/lib/client-display";
import { Workflow, ArrowLeft } from "lucide-react";
import { ProcessDocumentsSection } from "@/components/sc/ProcessDocumentsSection";
import { useProfilesMap } from "@/hooks/use-profiles-map";
import { useProcessMutations } from "@/hooks/processos/use-process-mutations";
import { ProcessMetadataSection } from "@/components/processos/detail/ProcessMetadataSection";
import { ProcessTimelineSection } from "@/components/processos/detail/ProcessTimelineSection";
import { ProcessStepsSection } from "@/components/processos/detail/ProcessStepsSection";
import { ProcessHistoryCard } from "@/components/processos/detail/ProcessHistoryCard";

export const Route = createFileRoute("/_authenticated/processos/$id")({
  component: ProcessDetail,
});

function ProcessDetail() {
  const { id } = Route.useParams();
  const { role, userId, loading } = useCurrentUser();
  const ready = !loading && (role === "admin" || role === "collaborator");

  const procQ = useQuery({
    queryKey: ["company-process", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_processes")
        .select(
          "id, client_id, process_type_id, responsavel_id, status, prioridade, progresso, total_etapas, etapas_concluidas, data_abertura, prazo_final, data_conclusao, motivo_espera, observacoes, is_demo, demo_batch_id, created_at, updated_at, clients(id, razao_social, nome_fantasia, documento), process_types(nome, categoria, cor)",
        )
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stepsQ = useQuery({
    queryKey: ["company-process-steps", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_process_steps")
        .select(
          "id, company_process_id, process_step_id, nome, descricao, ordem, departamento, obrigatoria, exige_documento, visivel_cliente, pode_concluir_manual, responsavel_id, prazo, prazo_tipo, prazo_dias, status, data_inicio, data_conclusao, concluida_por, concluida_dentro_prazo, observacoes, nome_publico, descricao_publica, observacao_publica, created_at, updated_at",
        )
        .eq("company_process_id", id).order("ordem").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const collabsQ = useQuery({
    queryKey: ["processes-collabs"],
    enabled: ready,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("collaborators")
        .select("id, user_id, nome_completo").eq("status", "active").order("nome_completo");
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.user_id);
    },
  });

  const historyQ = useQuery({
    queryKey: ["company-process-history", id],
    enabled: ready,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("timeline_events")
        .select("id, tipo, descricao, metadata, created_at, actor_profile_id")
        .filter("metadata->>process_id", "eq", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Resolve todos os nomes de profiles em UMA única consulta (evita N+1).
  const stepRows = stepsQ.data ?? [];
  const histRows = historyQ.data ?? [];
  const profileIds = [
    procQ.data?.responsavel_id ?? null,
    ...stepRows.flatMap((r: any) => [r.responsavel_id, r.concluida_por]),
    ...histRows.map((r: any) => r.actor_profile_id),
  ];
  const profilesMap = useProfilesMap(profileIds);
  const nameOf = (uid?: string | null) => (uid ? profilesMap.data?.[uid] ?? null : null);

  const proc = procQ.data
    ? { ...procQ.data, responsavel: procQ.data.responsavel_id ? { full_name: nameOf(procQ.data.responsavel_id) } : null }
    : null;
  const steps = stepRows.map((r: any) => ({
    ...r,
    responsavel: r.responsavel_id ? { full_name: nameOf(r.responsavel_id) } : null,
    concluida: r.concluida_por ? { full_name: nameOf(r.concluida_por) } : null,
  }));
  const history = histRows.map((r: any) => ({ ...r, actor_name: nameOf(r.actor_profile_id) }));

  // Mutações com optimistic locking (updated_at) e serialização por processo.
  const { updateProc, updateStep, removeProc } = useProcessMutations(id);

  const { total, done, pct } = useMemo(() => {
    const t = steps.length;
    const d = steps.filter((s: any) => s.status === "concluida").length;
    return { total: t, done: d, pct: t ? Math.round((d / t) * 100) : 0 };
  }, [steps]);

  if (loading) return <InlineLoading />;
  if (role !== "admin" && role !== "collaborator") {
    return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Acesso restrito" />;
  }
  if (procQ.isLoading) return <InlineLoading label="Carregando processo" />;
  if (!procQ.data) return <EmptyState icon={<Workflow className="h-6 w-6" />} title="Processo não encontrado" />;

  const p = proc as any;
  const isAdmin = role === "admin";

  return (
    <div>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/processos" search={{ client: undefined }}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Link>
        </Button>
      </div>

      <PageHeader
        title={p.process_types?.nome ?? "Processo"}
        description={clientLabel(p.clients)}
        action={
          isAdmin && <DeleteButton onConfirm={() => removeProc.mutate()} label="Excluir processo" iconOnly={false} />
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <ProcessMetadataSection
          p={p}
          done={done}
          total={total}
          pct={pct}
          collabs={collabsQ.data ?? []}
          onUpdate={updateProc.mutate}
        />
        <ProcessTimelineSection history={history} isLoading={historyQ.isLoading} />
      </div>

      <ProcessStepsSection
        steps={steps}
        isLoading={stepsQ.isLoading}
        userId={userId}
        collabs={collabsQ.data ?? []}
        onUpdateStep={updateStep.mutate}
      />

      <ProcessDocumentsSection
        processId={id}
        clientId={p.client_id}
        steps={steps.map((s: any) => ({ id: s.id, ordem: s.ordem, nome: s.nome }))}
        canEdit={isAdmin || role === "collaborator"}
      />

      {isAdmin && <ProcessHistoryCard history={history} isLoading={historyQ.isLoading} />}
    </div>
  );
}
