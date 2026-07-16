import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import { clientLabel } from "@/lib/client-display";
import {
  currentCompetencia,
  formatCompetenciaLong,
  isValidCompetencia,
  shiftCompetencia,
} from "@/lib/competencia";
import { clientStatusLabel, clientStatusTone } from "@/lib/competence-client-labels";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ArrowRight, History, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/meu-mes")({
  component: MyMonthPage,
  errorComponent: () => (
    <EmptyState
      icon={<CalendarClock className="h-6 w-6" />}
      title="Não foi possível carregar as informações da competência"
      description="Tente novamente em instantes."
    />
  ),
});

type PortalData = {
  client_id: string;
  empresa: string;
  competence: string;
  has_competence: boolean;
  status: string | null;
  progresso: number;
  updated_at: string | null;
  reopened: boolean;
};

type HistoryRow = {
  competence: string;
  status: string | null;
  updated_at: string | null;
  reopened: boolean;
};

function MyMonthPage() {
  const { userId, role, loading } = useCurrentUser();
  const isClient = role === "client";
  const navigate = useNavigate();
  const [comp, setComp] = useState<string>(currentCompetencia());
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // Empresas do cliente (RLS já filtra).
  const clientsQ = useQuery({
    queryKey: ["portal-my-clients", userId],
    enabled: !!userId && isClient,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento, status")
        .is("deleted_at", null)
        .neq("status", "inactive")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!selectedClient && clientsQ.data && clientsQ.data.length > 0) {
      setSelectedClient(clientsQ.data[0].id);
    }
  }, [clientsQ.data, selectedClient]);

  const clientId = selectedClient ?? clientsQ.data?.[0]?.id ?? null;

  const overviewQ = useQuery({
    queryKey: ["portal-competence", clientId, comp],
    enabled: !!clientId && isValidCompetencia(comp),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_client_competence_portal", {
        p_client_id: clientId,
        p_competence: comp,
      });
      if (error) throw error;
      return data as PortalData;
    },
  });

  const historyQ = useQuery({
    queryKey: ["portal-competence-history", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_client_competence_history", {
        p_client_id: clientId,
        p_limit: 12,
      });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });

  const empresa = useMemo(
    () => clientsQ.data?.find((c) => c.id === clientId) ?? null,
    [clientsQ.data, clientId],
  );

  if (!loading && !isClient) {
    return (
      <EmptyState
        icon={<Briefcase className="h-6 w-6" />}
        title="Área do cliente"
        description="Esta página é destinada aos clientes da Spolaor."
      />
    );
  }

  if ((clientsQ.data ?? []).length === 0 && !clientsQ.isLoading) {
    return (
      <div>
        <PageHeader title="Meu mês" description="Acompanhe a competência atual da sua empresa." />
        <EmptyState
          icon={<Briefcase className="h-6 w-6" />}
          title="Sem vínculo de empresa"
          description="Aguarde a equipe da Spolaor vincular sua conta."
        />
      </div>
    );
  }

  const data = overviewQ.data;

  return (
    <div>
      <PageHeader
        title="Meu mês"
        description="Acompanhe como está a competência atual da sua empresa."
      />

      {/* Filtros */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {(clientsQ.data ?? []).length > 1 && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Empresa</div>
              <Select value={clientId ?? ""} onValueChange={setSelectedClient}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  {(clientsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{clientLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Competência</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setComp((c) => shiftCompetencia(c, -1))}>
                ←
              </Button>
              <div className="flex-1 rounded-md border bg-background px-3 py-2 text-sm font-medium">
                {formatCompetenciaLong(comp)}
              </div>
              <Button variant="outline" size="sm" onClick={() => setComp((c) => shiftCompetencia(c, +1))}>
                →
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setComp(currentCompetencia())}>
                Hoje
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Card principal */}
      {overviewQ.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Carregando…</Card>
      ) : !data ? (
        <Card className="p-6 text-sm text-muted-foreground">Sem dados.</Card>
      ) : (
        <Card className="p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {empresa ? clientLabel(empresa) : data.empresa}
              </div>
              <div className="font-display text-2xl">{formatCompetenciaLong(data.competence)}</div>
              <div className="mt-2 flex items-center gap-2">
                <Badge className={clientStatusTone(data.status)}>
                  {clientStatusLabel(data.status)}
                </Badge>
                {data.reopened && (
                  <span className="text-xs text-orange-700">
                    Esta competência foi reaberta para ajustes.
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-[240px]">
              <div className="text-xs text-muted-foreground">Progresso</div>
              <div className="mt-1 flex items-center gap-3">
                <Progress value={data.progresso} className="h-3 flex-1" />
                <div className="text-lg font-semibold">{data.progresso}%</div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data.updated_at
                  ? `Última atualização ${formatDistanceToNow(new Date(data.updated_at), { addSuffix: true, locale: ptBR })}`
                  : "Sem atualização registrada"}
              </div>
            </div>
          </div>

          {!data.has_competence && (
            <div className="mt-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Esta competência ainda não foi iniciada pelo escritório.
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button asChild disabled={!clientId}>
              <Link
                to="/meu-mes/$clientId/$competence"
                params={{ clientId: clientId ?? "", competence: comp }}
              >
                Ver detalhes <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Histórico */}
      <Card className="mt-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <div className="font-medium">Histórico mensal</div>
        </div>
        {historyQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (historyQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma competência anterior registrada.</div>
        ) : (
          <ul className="divide-y">
            {(historyQ.data ?? []).map((h) => (
              <li key={h.competence} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{formatCompetenciaLong(h.competence)}</div>
                  <div className="mt-0.5">
                    <Badge className={clientStatusTone(h.status)}>{clientStatusLabel(h.status)}</Badge>
                  </div>
                </div>
                <Button asChild size="sm" variant="ghost" disabled={!clientId}>
                  <Link
                    to="/meu-mes/$clientId/$competence"
                    params={{ clientId: clientId ?? "", competence: h.competence }}
                  >
                    Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
