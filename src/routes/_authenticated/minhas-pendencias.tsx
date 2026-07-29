import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatBR, todayLocalYmd } from "@/lib/dates";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { DocumentWorkspacePagination } from "@/components/documentos/workspace/DocumentWorkspacePagination";
import { useClientPendings, type ClientPendingFilters } from "@/hooks/documentos/use-client-pendings";
import { usePortalClients } from "@/hooks/documentos/use-client-document-portal";
import type { ClientPendingRow } from "@/lib/documentos/client-pendings-types";
import { AlertCircle, CheckCircle2, ClipboardList, FileText, Receipt, Search, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minhas-pendencias")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const { userId, role, loading } = useCurrentUser();
  const ready = !loading && !!userId;
  const isStaff = role === "admin" || role === "collaborator";

  const [filters, setFilters] = useState<ClientPendingFilters>({
    page: 1,
    pageSize: 20,
    search: "",
    clientId: null,
    kind: null,
    includeDemo: true,
  });
  const patch = (p: Partial<ClientPendingFilters>) =>
    setFilters((f) => ({ ...f, page: p.page ?? 1, ...p }));

  const clientsQ = usePortalClients(ready);
  const clients = clientsQ.data ?? [];
  const multiEmpresa = clients.length > 1;

  const pendingsQ = useClientPendings(filters, ready);
  const rows = pendingsQ.data?.rows ?? [];
  const counts = pendingsQ.data?.counts;
  const total = pendingsQ.data?.total ?? 0;
  const today = todayLocalYmd();

  const hasFilters = !!filters.search || !!filters.clientId || !!filters.kind;

  return (
    <div className="space-y-4">
      <PageHeader
        title="O que preciso fazer"
        description="Tudo que está aguardando uma ação sua: documentos solicitados e guias sem comprovante."
      />

      {counts && counts.todos > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Aguardando envio: {counts.aguardando_envio}</Badge>
          <Badge variant="secondary">Reenvio solicitado: {counts.reenvio_solicitado}</Badge>
          <Badge variant="secondary">Guias: {counts.guias}</Badge>
          {counts.atrasados > 0 && <Badge variant="destructive">Em atraso: {counts.atrasados}</Badge>}
        </div>
      )}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Título, empresa, competência…"
                value={filters.search}
                onChange={(e) => patch({ search: e.target.value })}
              />
            </div>
          </div>
          {multiEmpresa && (
            <div>
              <Label className="text-xs">Empresa</Label>
              <Select
                value={filters.clientId ?? "all"}
                onValueChange={(v) => patch({ clientId: v === "all" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select
              value={filters.kind ?? "all"}
              onValueChange={(v) => patch({ kind: v === "all" ? null : (v as ClientPendingRow["item_kind"]) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="document_request">Documento solicitado</SelectItem>
                <SelectItem value="tax_guide">Guia/Imposto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ page: 1, pageSize: filters.pageSize, search: "", clientId: null, kind: null, includeDemo: true })}
              >
                <X className="mr-1 h-4 w-4" /> Limpar filtros
              </Button>
            </div>
          )}
        </div>
      </Card>

      {!ready || (pendingsQ.isLoading && !pendingsQ.data) ? (
        <Card className="p-5"><p className="text-sm text-muted-foreground">Carregando…</p></Card>
      ) : pendingsQ.error ? (
        <EmptyState
          icon={<AlertCircle className="h-6 w-6" />}
          title="Não foi possível carregar suas pendências"
          description="Tente novamente em instantes."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="Tudo em dia 🎉"
          description="Nada aguardando sua ação no momento."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const atrasado = !!r.prazo && r.prazo < today;
            const isDoc = r.item_kind === "document_request";
            return (
              <Card key={`${r.item_kind}:${r.item_id}`} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="gap-1">
                        {isDoc ? <FileText className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                        {isDoc ? "Documento solicitado" : "Guia/Imposto"}
                      </Badge>
                      <span className="font-medium">{r.titulo}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.empresa_label || r.empresa_nome || "—"}
                      {r.competencia ? ` · ${r.competencia}` : ""}
                      {r.prazo ? ` · Prazo: ${formatBR(r.prazo)}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {atrasado && <Badge variant="destructive">Em atraso</Badge>}
                    <Badge variant="secondary">{r.status_label}</Badge>
                    {isDoc ? (
                      <Button asChild size="sm">
                        <Link
                          to="/meus-documentos"
                          search={{
                            section: "precisa_enviar",
                            page: undefined,
                            page_size: undefined,
                            q: undefined,
                            client: r.client_id,
                            comp: undefined,
                            demo: undefined,
                            item: r.item_id,
                          }}
                        >
                          Enviar документо
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/minha-area">Ver guia</Link>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          <div className="pt-2">
            <DocumentWorkspacePagination
              page={pendingsQ.data?.page ?? filters.page}
              pageSize={pendingsQ.data?.page_size ?? filters.pageSize}
              total={total}
              onPage={(page) => setFilters((f) => ({ ...f, page }))}
              onPageSize={(pageSize) => setFilters((f) => ({ ...f, page: 1, pageSize }))}
            />
          </div>
        </div>
      )}

      {isStaff && <StaffInternalTasks />}
    </div>
  );
}

/** Visão interna (equipe): tarefas internas atribuídas, mantida como antes. */
function StaffInternalTasks() {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["my-tasks-internal"],
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_tasks")
        .select("*, clients(razao_social, nome_fantasia, documento)")
        .not("status", "in", "(concluida,cancelada)")
        .order("prazo");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Tarefas internas</h2>
      {error ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa interna aberta.</p>
      ) : (
        <ul className="space-y-2">
          {(data as any[]).map((t) => (
            <li key={t.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{t.titulo}</div>
                <div className="flex items-center gap-2"><PriorityBadge value={t.prioridade} /><StatusBadge value={t.status} /></div>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Empresa: {t.clients?.nome_fantasia || t.clients?.razao_social || "—"}
              </div>
              {t.prazo && <div className="mt-1 text-xs text-muted-foreground">Prazo: {formatBR(t.prazo)}</div>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
