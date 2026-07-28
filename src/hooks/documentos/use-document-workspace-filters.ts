import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { WorkspaceTab } from "@/lib/documentos/workspace-types";
import { WORKSPACE_TABS } from "@/lib/documentos/workspace-types";

const routeApi = getRouteApi("/_authenticated/documentos");

/** Nulo quando string vazia — garante consistência entre URL, RPC e estado. */
const orNull = (v: string | undefined) => (v && v.length ? v : null);

export type WorkspaceFilters = {
  tab: WorkspaceTab;
  page: number;
  pageSize: number;
  search: string;
  clientId: string | null;
  competencia: string | null;
  categoria: string | null;
  tipo: string | null;
  departamento: string | null;
  status: string | null;
  actionOwner: string | null;
  responsavelId: string | null;
  origem: string | null;
  prazoFrom: string | null;
  prazoTo: string | null;
  validadeFrom: string | null;
  validadeTo: string | null;
  temDocumento: boolean | null;
  temVinculo: boolean | null;
  somenteMeus: boolean;
  demo: "real" | "demo" | "all";
  demoBatchId: string | null;
};

const VALID_TABS = new Set(WORKSPACE_TABS.map((t) => t.value));

function parseTab(v: string | undefined): WorkspaceTab {
  return v && VALID_TABS.has(v as WorkspaceTab) ? (v as WorkspaceTab) : "aguardando_cliente";
}
function parseDemo(v: string | undefined): "real" | "demo" | "all" {
  return v === "demo" || v === "all" ? v : "real";
}
function parseBool(v: string | undefined): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function useWorkspaceFilters() {
  const s = routeApi.useSearch();
  const navigate = useNavigate();

  const filters: WorkspaceFilters = useMemo(() => ({
    tab: parseTab(s.tab),
    page: Math.max(1, Number(s.page) || 1),
    pageSize: [30, 50, 100].includes(Number(s.page_size)) ? Number(s.page_size) : 30,
    search: typeof s.q === "string" ? s.q : "",
    clientId: orNull(typeof s.client === "string" ? s.client : undefined),
    competencia: orNull(typeof s.comp === "string" ? s.comp : undefined),
    categoria: orNull(typeof s.categoria === "string" ? s.categoria : undefined),
    tipo: orNull(typeof s.tipo === "string" ? s.tipo : undefined),
    departamento: orNull(typeof s.dep === "string" ? s.dep : undefined),
    status: orNull(typeof s.status === "string" ? s.status : undefined),
    actionOwner: orNull(typeof s.owner === "string" ? s.owner : undefined),
    responsavelId: orNull(typeof s.resp === "string" ? s.resp : undefined),
    origem: orNull(typeof s.origem === "string" ? s.origem : undefined),
    prazoFrom: orNull(typeof s.prazo_from === "string" ? s.prazo_from : undefined),
    prazoTo: orNull(typeof s.prazo_to === "string" ? s.prazo_to : undefined),
    validadeFrom: orNull(typeof s.val_from === "string" ? s.val_from : undefined),
    validadeTo: orNull(typeof s.val_to === "string" ? s.val_to : undefined),
    temDocumento: parseBool(typeof s.tem_doc === "string" ? s.tem_doc : undefined),
    temVinculo: parseBool(typeof s.tem_link === "string" ? s.tem_link : undefined),
    somenteMeus: s.meus === "1",
    demo: parseDemo(typeof s.demo === "string" ? s.demo : undefined),
    demoBatchId: orNull(typeof s.demo_batch === "string" ? s.demo_batch : undefined),
  }), [s]);

  /** Atualiza filtros, resetando página quando qualquer filtro muda. */
  const setFilters = useCallback((patch: Partial<Record<keyof typeof s, string | number | undefined>>, opts?: { resetPage?: boolean }) => {
    const reset = opts?.resetPage ?? true;
    navigate({
      to: "/documentos",
      search: (prev: Record<string, unknown>) => {
        const next: Record<string, string | number | undefined> = {
          ...(prev as Record<string, string | number | undefined>),
          ...patch,
        };
        for (const k of Object.keys(next)) {
          if (next[k] === "" || next[k] === undefined || next[k] === null) delete next[k];
        }
        if (reset) delete next.page;
        return next;
      },
      replace: true,
    });
  }, [navigate]);

  const setTab = useCallback((tab: WorkspaceTab) => setFilters({ tab }), [setFilters]);
  const setPage = useCallback((page: number) => setFilters({ page }, { resetPage: false }), [setFilters]);
  const setPageSize = useCallback((size: number) => setFilters({ page_size: size }), [setFilters]);

  const clearAll = useCallback(() => {
    navigate({
      to: ".",
      search: () => ({ tab: filters.tab }),
      replace: true,
    });
  }, [navigate, filters.tab]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.search) n++;
    if (filters.clientId) n++;
    if (filters.competencia) n++;
    if (filters.categoria) n++;
    if (filters.tipo) n++;
    if (filters.departamento) n++;
    if (filters.status) n++;
    if (filters.actionOwner) n++;
    if (filters.responsavelId) n++;
    if (filters.origem) n++;
    if (filters.prazoFrom || filters.prazoTo) n++;
    if (filters.validadeFrom || filters.validadeTo) n++;
    if (filters.temDocumento !== null) n++;
    if (filters.temVinculo !== null) n++;
    if (filters.somenteMeus) n++;
    if (filters.demo !== "real") n++;
    if (filters.demoBatchId) n++;
    return n;
  }, [filters]);

  return { filters, setFilters, setTab, setPage, setPageSize, clearAll, activeCount };
}
