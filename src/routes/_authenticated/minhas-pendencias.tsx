import { createFileRoute } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { ClipboardList } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/minhas-pendencias")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const { userId, loading } = useCurrentUser();
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["my-tasks", userId],
    enabled: !loading && !!userId,
    retry: 1,
    queryFn: async () => {
      // RLS já filtra por user_has_client_access (multiempresa).
      const { data: cs, error: cErr } = await supabase.from("clients").select("id");
      if (cErr) throw cErr;
      const ids = (cs ?? []).map((c) => c.id); if (!ids.length) return [];
      const { data, error } = await supabase
        .from("pending_tasks")
        .select("*, clients(razao_social, nome_fantasia, documento)")
        .in("client_id", ids)
        .order("prazo");
      if (error) throw error;
      return data ?? [];
    },
  });
  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = (data as any[]).filter((t) => inRange(t.prazo, range));
  return (
    <div>
      <PageHeader title="Minhas pendências" description="O que está aguardando você ou em andamento." />
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeFilter value={dateF} onChange={setDateF} label="Prazo" />
          <Button variant="ghost" size="sm" onClick={() => setDateF(EMPTY_DATE_FILTER)}>Limpar filtros</Button>
        </div>
      </Card>
      <Card className="p-5">
        {error ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />
        : isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : filtered.length === 0 ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Sem pendências" description="Você está em dia. 🎉" /> : (
          <ul className="space-y-2">
            {filtered.map((t: any) => (
              <li key={t.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{t.titulo}</div>
                  <div className="flex items-center gap-2"><PriorityBadge value={t.prioridade} /><StatusBadge value={t.status} /></div>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Empresa: {t.clients?.nome_fantasia || t.clients?.razao_social || "—"}
                </div>
                {t.descricao && <div className="mt-1 text-sm text-muted-foreground">{t.descricao}</div>}
                {t.prazo && <div className="mt-1 text-xs text-muted-foreground">Prazo: {formatBR(t.prazo)}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
