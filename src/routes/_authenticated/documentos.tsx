import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/sc/PageHeader";
import { EmptyState } from "@/components/sc/EmptyState";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, FileText, Inbox } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useWorkspaceFilters } from "@/hooks/documentos/use-document-workspace-filters";
import { useDocumentWorkspace, useNeedToRequestDiagnostic } from "@/hooks/documentos/use-document-workspace";
import { useWorkspaceActions } from "@/hooks/documentos/use-document-workspace-actions";
import { DocumentWorkspaceTabs, DocumentWorkspaceTabsMobile } from "@/components/documentos/workspace/DocumentWorkspaceTabs";
import { DocumentWorkspaceFilters } from "@/components/documentos/workspace/DocumentWorkspaceFilters";
import { DocumentWorkspaceRow } from "@/components/documentos/workspace/DocumentWorkspaceRow";
import { DocumentWorkspacePagination } from "@/components/documentos/workspace/DocumentWorkspacePagination";
import { DocumentWorkspaceDetailSheet } from "@/components/documentos/workspace/DocumentWorkspaceDetailSheet";
import { RowRapidActions } from "@/components/documentos/workspace/RowRapidActions";
import { NeedToRequestPanel } from "@/components/documentos/workspace/NeedToRequestPanel";
import { CreateRequestDialog } from "@/components/documentos/workspace/CreateRequestDialog";
import { useEligibleChecklistItems } from "@/hooks/documentos/use-create-document-request";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { WorkspaceRow } from "@/lib/documentos/workspace-types";
import { useNavigate } from "@tanstack/react-router";

// Fase 4 — Central de Documentos + Solicitações (interface staff).
// A rota apenas orquestra: nada de lógica de action_owner/counts aqui,
// tudo vem das RPCs da Fase 3.
export const Route = createFileRoute("/_authenticated/documentos")({
  component: DocsPage,
  validateSearch: (search: Record<string, unknown>) => {
    const str = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
    const num = (k: string) => {
      const v = search[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
      return undefined;
    };
    return {
      tab: str("tab"),
      page: num("page"),
      page_size: num("page_size"),
      q: str("q"),
      client: str("client"),
      comp: str("comp"),
      categoria: str("categoria"),
      tipo: str("tipo"),
      dep: str("dep"),
      status: str("status"),
      owner: str("owner"),
      resp: str("resp"),
      origem: str("origem"),
      prazo_from: str("prazo_from"),
      prazo_to: str("prazo_to"),
      val_from: str("val_from"),
      val_to: str("val_to"),
      tem_doc: str("tem_doc"),
      tem_link: str("tem_link"),
      meus: str("meus"),
      demo: str("demo"),
      demo_batch: str("demo_batch"),
    };
  },
  errorComponent: () => (
    <EmptyState
      icon={<AlertCircle className="h-6 w-6" />}
      title="Não foi possível carregar a Central de Documentos"
      description="Tente recarregar a página ou volte em instantes."
    />
  ),
});

function DocsPage() {
  const { role, userId, loading } = useCurrentUser();
  const ready = !loading && !!userId && !!role;
  const isStaff = role === "admin" || role === "collaborator";
  const navigate = useNavigate();

  const { filters, setFilters, setTab, setPage, setPageSize, clearAll, activeCount } = useWorkspaceFilters();
  const [detailRow, setDetailRow] = useState<WorkspaceRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const workspaceQ = useDocumentWorkspace(filters, ready && isStaff);
  const includeDemo = filters.demo !== "real";
  const needToRequestQ = useNeedToRequestDiagnostic(
    filters.clientId,
    includeDemo,
    ready && isStaff && filters.tab === "precisa_solicitar",
  );
  const eligibleQ = useEligibleChecklistItems(
    {
      clientId: filters.clientId,
      competencia: filters.competencia,
      search: filters.search,
      includeDemo,
      page: filters.page,
      pageSize: filters.pageSize,
    },
    ready && isStaff && filters.tab === "precisa_solicitar",
  );
  const actions = useWorkspaceActions();
  const [createOpen, setCreateOpen] = useState(false);

  const openDetail = (row: WorkspaceRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  const rows = workspaceQ.data?.rows ?? [];
  const counts = workspaceQ.data?.counts;
  const total = workspaceQ.data?.total ?? 0;

  const isPrecisaSolicitar = filters.tab === "precisa_solicitar";

  const emptyDescription = useMemo(() => {
    if (!filters.tab) return "Ajuste os filtros para ver mais itens.";
    if (filters.tab === "aguardando_cliente") return "Nenhuma solicitação aguardando cliente.";
    if (filters.tab === "recebidos") return "Nenhum item aguardando revisão da equipe.";
    if (filters.tab === "reenviar") return "Nenhuma solicitação marcada para reenvio.";
    if (filters.tab === "concluidos") return "Nenhum item concluído no recorte atual.";
    if (filters.tab === "vinculados") return "Nenhum item vinculado a processo no recorte atual.";
    if (filters.tab === "vencendo") return "Nenhum documento vencendo nos próximos 30 dias.";
    if (filters.tab === "vencidos") return "Nenhum documento vencido.";
    return "Nenhum item encontrado.";
  }, [filters.tab]);

  if (!isStaff && ready) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Central de Documentos" description="Acesso restrito à equipe." />
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Portal do cliente ainda usa a visão anterior"
          description="Esta interface unificada foi liberada apenas para a equipe nesta fase."
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Central de Documentos"
        description="Solicitações e documentos em uma visão unificada por status e ação necessária."
        action={
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova solicitação
          </Button>
        }
      />

      <Card className="p-4 space-y-4">
        <div className="hidden md:block">
          <DocumentWorkspaceTabs
            value={filters.tab}
            onChange={setTab}
            counts={counts}
            needToRequestCount={needToRequestQ.data?.elegiveis}
          />
        </div>
        <div className="md:hidden">
          <DocumentWorkspaceTabsMobile
            value={filters.tab}
            onChange={setTab}
            counts={counts}
            needToRequestCount={needToRequestQ.data?.elegiveis}
          />
        </div>

        {!isPrecisaSolicitar && (
          <DocumentWorkspaceFilters
            filters={filters}
            activeCount={activeCount}
            onChange={(patch) => setFilters(patch)}
            onClear={clearAll}
          />
        )}
      </Card>

      {isPrecisaSolicitar ? (
        <NeedToRequestPanel
          data={needToRequestQ.data}
          loading={needToRequestQ.isLoading}
          error={(needToRequestQ.error as Error | null) ?? null}
          onGoToChecklist={() => navigate({ to: "/checklist", search: { client: filters.clientId ?? undefined, comp: filters.competencia ?? undefined, expand: undefined } })}
          items={eligibleQ.data?.rows ?? []}
          itemsTotal={eligibleQ.data?.total ?? 0}
          itemsLoading={eligibleQ.isLoading}
          itemsError={(eligibleQ.error as Error | null) ?? null}
          page={eligibleQ.data?.page ?? filters.page}
          pageSize={eligibleQ.data?.page_size ?? filters.pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      ) : workspaceQ.isLoading && !workspaceQ.data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-1/2 mb-2" />
              <Skeleton className="h-4 w-2/3 mb-1" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
          ))}
        </div>
      ) : workspaceQ.error ? (
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title="Não foi possível carregar"
          description={(workspaceQ.error as Error).message}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title="Nada por aqui"
          description={emptyDescription}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <DocumentWorkspaceRow
              key={`${row.item_kind}:${row.item_id}`}
              row={row}
              onOpen={openDetail}
              actions={<RowRapidActions row={row} actions={actions} />}
            />
          ))}
          <div className="pt-2">
            <DocumentWorkspacePagination
              page={workspaceQ.data?.page ?? filters.page}
              pageSize={workspaceQ.data?.page_size ?? filters.pageSize}
              total={total}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </div>
        </div>
      )}

      <DocumentWorkspaceDetailSheet
        row={detailRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        actions={actions}
      />
    </div>
  );
}
