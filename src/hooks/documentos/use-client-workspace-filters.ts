import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { PortalSection } from "@/lib/documentos/portal-types";

export type ClientWorkspaceFilters = {
  section: PortalSection;
  page: number;
  pageSize: number;
  search: string;
  clientId: string | null;
  competencia: string | null;
  includeDemo: boolean;
};

const DEFAULT_PAGE_SIZE = 30;
const VALID_SECTIONS: PortalSection[] = ["precisa_enviar", "historico"];

export function useClientWorkspaceFilters() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/meus-documentos" }) as Record<string, unknown>;

  const filters: ClientWorkspaceFilters = useMemo(() => {
    const rawSection = typeof search.section === "string" ? (search.section as PortalSection) : "precisa_enviar";
    const section: PortalSection = VALID_SECTIONS.includes(rawSection) ? rawSection : "precisa_enviar";
    const page = Number(search.page) > 0 ? Number(search.page) : 1;
    const pageSize = [30, 50, 100].includes(Number(search.page_size)) ? Number(search.page_size) : DEFAULT_PAGE_SIZE;
    return {
      section,
      page,
      pageSize,
      search: typeof search.q === "string" ? (search.q as string) : "",
      clientId: typeof search.client === "string" ? (search.client as string) : null,
      competencia: typeof search.comp === "string" ? (search.comp as string) : null,
      includeDemo: search.demo !== "real",
    };
  }, [search]);

  const patch = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      navigate({
        to: "/meus-documentos",
        search: (prev) => {
          const next: Record<string, unknown> = { ...(prev as object) };
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === "" || v === null) delete next[k];
            else next[k] = v;
          }
          // Se qualquer filtro (que não seja page) mudou, reset página.
          if (Object.keys(updates).some((k) => k !== "page" && k !== "page_size")) {
            delete next.page;
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const setSection = useCallback((s: PortalSection) => patch({ section: s === "precisa_enviar" ? undefined : s, page: undefined }), [patch]);
  const setPage = useCallback((p: number) => patch({ page: p > 1 ? p : undefined }), [patch]);
  const setPageSize = useCallback((n: number) => patch({ page_size: n === DEFAULT_PAGE_SIZE ? undefined : n, page: undefined }), [patch]);
  const setSearch = useCallback((q: string) => patch({ q: q || undefined }), [patch]);
  const setClient = useCallback((id: string | null) => patch({ client: id ?? undefined }), [patch]);
  const setCompetencia = useCallback((v: string | null) => patch({ comp: v ?? undefined }), [patch]);

  const clearAll = useCallback(() => {
    navigate({ to: "/meus-documentos", search: {}, replace: true });
  }, [navigate]);

  const activeCount =
    (filters.search ? 1 : 0) +
    (filters.clientId ? 1 : 0) +
    (filters.competencia ? 1 : 0);

  return { filters, setSection, setPage, setPageSize, setSearch, setClient, setCompetencia, clearAll, activeCount };
}
