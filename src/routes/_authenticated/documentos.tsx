import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { DOC_TYPES, DOC_STATUSES, labelOf, normalizeDocTipo } from "@/lib/sc-types";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";


export const Route = createFileRoute("/_authenticated/documentos")({
  component: DocsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    client: typeof search.client === "string" ? search.client : undefined,
    comp: typeof search.comp === "string" ? search.comp : undefined,
  }),
  errorComponent: () => <EmptyState icon={<FileText className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />,
});


function DocsPage() {
  const { role, userId, loading } = useCurrentUser();
  const qc = useQueryClient();
  const ready = !loading && !!userId && !!role;
  const routeSearch = Route.useSearch();
  const [q, setQ] = useState(""); const [tipo, setTipo] = useState("all"); const [status, setStatus] = useState("all");
  const [fClient, setFClient] = useState<string>(routeSearch.client ?? "all");
  const [fComp, setFComp] = useState<string>(routeSearch.comp ?? "");
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);


  const { data: clients = [] } = useQuery({
    queryKey: ["docs-clients", userId, role],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .is("deleted_at", null)
        .neq("status", "inactive")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: list = [], isLoading, error: listError } = useQuery({
    queryKey: ["all-docs", userId, role],
    enabled: ready,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*, clients(razao_social, nome_fantasia), company_process_documents(id, company_process_id, company_process_step_id, company_processes(id, process_types(nome)))")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete: only the uploader can do this (enforced by RLS too).
      const { error } = await supabase
        .from("documents")
        .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-docs"] }); toast.success("Arquivo removido pelo autor."); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha")),
  });
  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const qLower = q.trim().toLowerCase();
  const filtered = list.filter((d: any) => {
    if (fClient !== "all" && d.client_id !== fClient) return false;
    if (fComp && d.competencia !== fComp) return false;
    if (tipo !== "all" && normalizeDocTipo(d.tipo) !== normalizeDocTipo(tipo)) return false;
    if (status !== "all" && d.status !== status) return false;
    if (qLower && !`${d.nome ?? ""} ${d.clients?.razao_social ?? ""} ${d.clients?.nome_fantasia ?? ""}`.toLowerCase().includes(qLower)) return false;
    if (!inRange(d.created_at, range)) return false;
    return true;
  });
  const clearFilters = () => { setQ(""); setTipo("all"); setStatus("all"); setFClient("all"); setFComp(""); setDateF(EMPTY_DATE_FILTER); };


  if (!ready) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div>
      <PageHeader title="Documentos" description="Central de documentos das empresas cadastradas." />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={fClient} onValueChange={setFClient}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {(clients as any[]).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social || c.documento || "Empresa"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos status</SelectItem>{DOC_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <DateRangeFilter value={dateF} onChange={setDateF} label="Criado em" />
          <Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
        </div>
        {listError ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." /> :
         isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
         filtered.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum registro encontrado." /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b"><th className="py-2 pr-4">Arquivo</th><th>Empresa</th><th>Tipo</th><th>Competência</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => (
                <tr key={d.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">
                    <div>{d.nome}</div>
                    {(d.company_process_documents ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(d.company_process_documents as any[]).map((cpd) => (
                          <Link key={cpd.id} to="/processos/$id" params={{ id: cpd.company_process_id }}
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 hover:underline">
                            Processo: {cpd.company_processes?.process_types?.nome ?? "—"}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {d.client_id ? (
                      <Link to="/clientes/$id" params={{ id: d.client_id }} className="text-secondary hover:underline">
                        {d.clients?.nome_fantasia || d.clients?.razao_social || "Empresa"}
                      </Link>
                    ) : (
                      <span>{d.clients?.nome_fantasia || d.clients?.razao_social || "—"}</span>
                    )}
                  </td>
                  <td>{labelOf(DOC_TYPES, d.tipo)}</td>
                  <td>{d.competencia ?? "—"}</td>
                  <td><StatusBadge value={d.status} /></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <AttachmentButton storagePath={d.storage_path} label="Abrir" />
                      {(d.uploaded_by === userId || role === "admin") && (
                        <DeleteButton
                          onConfirm={() => remove.mutate(d.id)}
                          iconOnly
                          description={d.uploaded_by === userId
                            ? "Tem certeza que deseja apagar este item enviado por você? Esta ação ficará registrada no histórico."
                            : "Exclusão administrativa: este arquivo foi enviado por outro usuário. Esta ação ficará registrada no histórico."}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

