import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { EmptyState } from "@/components/sc/EmptyState";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, FileText, Inbox, Search, X } from "lucide-react";
import { useClientWorkspaceFilters } from "@/hooks/documentos/use-client-workspace-filters";
import { useClientDocumentPortal, usePortalClients } from "@/hooks/documentos/use-client-document-portal";
import { PortalRow } from "@/components/documentos/portal/PortalRow";
import { PortalDetailSheet } from "@/components/documentos/portal/PortalDetailSheet";
import { DocumentWorkspacePagination } from "@/components/documentos/workspace/DocumentWorkspacePagination";
import type { PortalRow as Row, PortalSection } from "@/lib/documentos/portal-types";

// Portal do Cliente — Fase 5.
// Fonte exclusiva: RPC list_client_document_workspace_paginated (Fase 3).
export const Route = createFileRoute("/_authenticated/meus-documentos")({
  component: MyDocsPage,
  validateSearch: (search: Record<string, unknown>) => {
    const str = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
    const num = (k: string) => {
      const v = search[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
      return undefined;
    };
    return {
      section: str("section"),
      page: num("page"),
      page_size: num("page_size"),
      q: str("q"),
      client: str("client"),
      comp: str("comp"),
      demo: str("demo"),
      item: str("item"),
    };
  },
});

function MyDocsPage() {
  const { userId, role, loading } = useCurrentUser();
  const ready = !loading && !!userId;
  const { item: deepLinkItem } = Route.useSearch();
  const { filters, setSection, setPage, setPageSize, setSearch, setClient, setCompetencia, clearAll, activeCount } =
    useClientWorkspaceFilters();

  const [searchInput, setSearchInput] = useState(filters.search);
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const clientsQ = usePortalClients(ready);
  const clients = clientsQ.data ?? [];
  const multiEmpresa = clients.length > 1;

  const portalQ = useClientDocumentPortal(filters, ready);
  const rows = portalQ.data?.rows ?? [];
  const counts = portalQ.data?.counts;
  const total = portalQ.data?.total ?? 0;

  const openDetail = (row: Row) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  // Deep link vindo de "O que preciso fazer": abre o item correspondente.
  useEffect(() => {
    if (!deepLinkItem || autoOpened || rows.length === 0) return;
    const match = rows.find((r) => r.item_id === deepLinkItem);
    if (match) {
      setDetailRow(match);
      setDetailOpen(true);
      setAutoOpened(true);
    }
  }, [deepLinkItem, autoOpened, rows]);

  const isStaff = role === "admin" || role === "collaborator";


  const sections: { value: PortalSection; label: string; badge?: number }[] = [
    { value: "precisa_enviar", label: "Preciso enviar", badge: (counts?.aguardando_voce ?? 0) + (counts?.precisa_reenviar ?? 0) },
    { value: "historico", label: "Histórico e documentos", badge: counts ? counts.em_analise + counts.concluidos + counts.aguardando_contabilidade + counts.cancelados : undefined },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Meus documentos"
        description={
          filters.section === "precisa_enviar"
            ? "Itens que a contabilidade está esperando que você envie."
            : "Documentos já enviados e itens em análise pela contabilidade."
        }
      />

      {isStaff && ready && (
        <Card className="p-3 border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
          <p className="text-xs text-amber-900 dark:text-amber-100">
            Você está autenticado como equipe. Esta é a visão do cliente — só aparecem empresas em que você é vinculado como cliente.
          </p>
        </Card>
      )}

      <Card className="p-4 space-y-4">
        {/* Seções — desktop tabs; mobile chips */}
        <div className="hidden md:flex gap-2">
          {sections.map((s) => (
            <Button
              key={s.value}
              variant={filters.section === s.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSection(s.value)}
            >
              {s.label}
              {typeof s.badge === "number" && (
                <Badge variant="secondary" className="ml-2">{s.badge}</Badge>
              )}
            </Button>
          ))}
        </div>
        <div className="md:hidden flex gap-2 overflow-x-auto">
          {sections.map((s) => (
            <Button
              key={s.value}
              variant={filters.section === s.value ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setSection(s.value)}
            >
              {s.label}
              {typeof s.badge === "number" && (
                <Badge variant="secondary" className="ml-2">{s.badge}</Badge>
              )}
            </Button>
          ))}
        </div>

        {/* Filtros server-side */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Título, tipo, competência…"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setSearch(e.target.value);
                }}
              />
            </div>
          </div>
          {multiEmpresa && (
            <div>
              <Label className="text-xs">Empresa</Label>
              <Select
                value={filters.clientId ?? "all"}
                onValueChange={(v) => setClient(v === "all" ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_fantasia || c.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Competência</Label>
            <Input
              placeholder="2026-06"
              value={filters.competencia ?? ""}
              onChange={(e) => setCompetencia(e.target.value || null)}
            />
          </div>
          {activeCount > 0 && (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => { setSearchInput(""); clearAll(); }}>
                <X className="mr-1 h-4 w-4" /> Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </Card>

      {!ready ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-1/2 mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : portalQ.isLoading && !portalQ.data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-1/2 mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : portalQ.error ? (
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title="Não foi possível carregar seus documentos"
          description={(portalQ.error as Error).message}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={filters.section === "precisa_enviar" ? <FileText className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
          title={filters.section === "precisa_enviar" ? "Tudo em dia!" : "Nada por aqui"}
          description={
            filters.section === "precisa_enviar"
              ? "Não há documentos aguardando envio no momento."
              : "Ainda não há documentos no histórico com os filtros atuais."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <PortalRow
              key={`${row.item_kind}:${row.item_id}`}
              row={row}
              onOpen={openDetail}
              showEmpresa={multiEmpresa}
            />
          ))}
          <div className="pt-2">
            <DocumentWorkspacePagination
              page={portalQ.data?.page ?? filters.page}
              pageSize={portalQ.data?.page_size ?? filters.pageSize}
              total={total}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </div>
        </div>
      )}

      <PortalDetailSheet
        row={detailRow}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        userId={userId}
      />
    </div>
  );
}
