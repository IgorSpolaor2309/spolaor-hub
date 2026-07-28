import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { WORKSPACE_QK } from "@/lib/documentos/workspace-types";
import type { WorkspaceFilters } from "@/hooks/documentos/use-document-workspace-filters";

type Props = {
  filters: WorkspaceFilters;
  activeCount: number;
  onChange: (patch: Record<string, string | undefined>) => void;
  onClear: () => void;
};

function useClientsBrief() {
  return useQuery({
    queryKey: WORKSPACE_QK.clientsBrief,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia")
        .is("deleted_at", null)
        .order("razao_social", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useResponsaveis() {
  return useQuery({
    queryKey: WORKSPACE_QK.responsaveis,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "ativo")
        .order("full_name", { ascending: true })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function DocumentWorkspaceFilters({ filters, activeCount, onChange, onClear }: Props) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const { role } = useCurrentUser();
  const clientsQ = useClientsBrief();
  const responsaveisQ = useResponsaveis();

  // Espelha a URL quando o usuário navega para trás.
  useEffect(() => { setSearchInput(filters.search); }, [filters.search]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== filters.search) onChange({ q: searchInput || undefined });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const clients = clientsQ.data ?? [];
  const responsaveis = responsaveisQ.data ?? [];

  const clientLabel = useMemo(() => {
    if (!filters.clientId) return null;
    const c = clients.find((c) => c.id === filters.clientId);
    return c ? (c.nome_fantasia || c.razao_social) : filters.clientId.slice(0, 8);
  }, [filters.clientId, clients]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por título, documento, empresa, competência…"
            className="pl-9"
          />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {activeCount > 0 && <Badge variant="secondary">{activeCount}</Badge>}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtros avançados</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-4 mt-4">
              <div className="grid gap-2">
                <Label>Empresa</Label>
                <Select
                  value={filters.clientId ?? "all"}
                  onValueChange={(v) => onChange({ client: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as empresas</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome_fantasia || c.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Competência</Label>
                  <Input
                    placeholder="AAAA-MM"
                    value={filters.competencia ?? ""}
                    onChange={(e) => onChange({ comp: e.target.value || undefined })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Departamento</Label>
                  <Input
                    value={filters.departamento ?? ""}
                    onChange={(e) => onChange({ dep: e.target.value || undefined })}
                    placeholder="Fiscal, Contábil…"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Categoria</Label>
                  <Input
                    value={filters.categoria ?? ""}
                    onChange={(e) => onChange({ categoria: e.target.value || undefined })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Tipo</Label>
                  <Input
                    value={filters.tipo ?? ""}
                    onChange={(e) => onChange({ tipo: e.target.value || undefined })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={filters.status ?? "all"}
                  onValueChange={(v) => onChange({ status: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="aguardando">Aguardando</SelectItem>
                    <SelectItem value="recebido">Recebido</SelectItem>
                    <SelectItem value="reenviar">Reenviar</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Quem precisa agir</Label>
                <Select
                  value={filters.actionOwner ?? "all"}
                  onValueChange={(v) => onChange({ owner: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualquer</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                    <SelectItem value="staff">Equipe</SelectItem>
                    <SelectItem value="none">Nenhum</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Responsável</Label>
                <Select
                  value={filters.responsavelId ?? "all"}
                  onValueChange={(v) => onChange({ resp: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {responsaveis.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Origem</Label>
                <Select
                  value={filters.origem ?? "all"}
                  onValueChange={(v) => onChange({ origem: v === "all" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="document_request">Solicitação</SelectItem>
                    <SelectItem value="document">Documento avulso</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Prazo de</Label>
                  <Input type="date" value={filters.prazoFrom ?? ""} onChange={(e) => onChange({ prazo_from: e.target.value || undefined })} />
                </div>
                <div className="grid gap-2">
                  <Label>até</Label>
                  <Input type="date" value={filters.prazoTo ?? ""} onChange={(e) => onChange({ prazo_to: e.target.value || undefined })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Validade de</Label>
                  <Input type="date" value={filters.validadeFrom ?? ""} onChange={(e) => onChange({ val_from: e.target.value || undefined })} />
                </div>
                <div className="grid gap-2">
                  <Label>até</Label>
                  <Input type="date" value={filters.validadeTo ?? ""} onChange={(e) => onChange({ val_to: e.target.value || undefined })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tem documento?</Label>
                  <Select
                    value={filters.temDocumento === null ? "any" : filters.temDocumento ? "true" : "false"}
                    onValueChange={(v) => onChange({ tem_doc: v === "any" ? undefined : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="true">Com documento</SelectItem>
                      <SelectItem value="false">Sem documento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Vinculado a processo?</Label>
                  <Select
                    value={filters.temVinculo === null ? "any" : filters.temVinculo ? "true" : "false"}
                    onValueChange={(v) => onChange({ tem_link: v === "any" ? undefined : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      <SelectItem value="true">Vinculado</SelectItem>
                      <SelectItem value="false">Sem vínculo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <Label>Somente meus</Label>
                  <p className="text-xs text-muted-foreground">Filtra por responsável = eu.</p>
                </div>
                <Button
                  variant={filters.somenteMeus ? "default" : "outline"}
                  size="sm"
                  onClick={() => onChange({ meus: filters.somenteMeus ? undefined : "1" })}
                >
                  {filters.somenteMeus ? "Ativado" : "Ativar"}
                </Button>
              </div>

              {role === "admin" && (
                <div className="grid gap-2">
                  <Label>Ambiente</Label>
                  <Select
                    value={filters.demo}
                    onValueChange={(v) => onChange({ demo: v === "real" ? undefined : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="real">Somente reais</SelectItem>
                      <SelectItem value="demo">Somente demo</SelectItem>
                      <SelectItem value="all">Reais + demo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0}>
                  <X className="h-4 w-4 mr-1" /> Limpar filtros
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Filtros ativos:</span>
          {filters.clientId && clientLabel && (
            <Badge variant="secondary" className="gap-1">
              Empresa: {clientLabel}
              <button onClick={() => onChange({ client: undefined })} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.competencia && (
            <Badge variant="secondary" className="gap-1">
              Comp.: {filters.competencia}
              <button onClick={() => onChange({ comp: undefined })} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.status && (
            <Badge variant="secondary" className="gap-1">
              Status: {filters.status}
              <button onClick={() => onChange({ status: undefined })} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.actionOwner && (
            <Badge variant="secondary" className="gap-1">
              Ação: {filters.actionOwner}
              <button onClick={() => onChange({ owner: undefined })} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.somenteMeus && (
            <Badge variant="secondary" className="gap-1">
              Somente meus
              <button onClick={() => onChange({ meus: undefined })} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          {filters.demo !== "real" && (
            <Badge variant="secondary" className="gap-1">
              Ambiente: {filters.demo}
              <button onClick={() => onChange({ demo: undefined })} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={onClear} className="h-6 px-2 text-xs">Limpar tudo</Button>
        </div>
      )}
    </div>
  );
}
