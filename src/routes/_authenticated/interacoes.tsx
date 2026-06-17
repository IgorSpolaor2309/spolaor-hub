import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/sc/EmptyState";
import { DateRangeFilter, EMPTY_DATE_FILTER, type DateFilterValue } from "@/components/sc/DateRangeFilter";
import { inRange, resolveRange } from "@/lib/date-ranges";
import { MessageSquare } from "lucide-react";
import { INTERACTION_TYPES, labelOf } from "@/lib/sc-types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/interacoes")({
  component: InteractionsPage,
});

function InteractionsPage() {
  const [dateF, setDateF] = useState<DateFilterValue>(EMPTY_DATE_FILTER);
  const { data = [] } = useQuery({
    queryKey: ["all-inter"],
    queryFn: async () => (await supabase.from("interactions").select("*, clients(razao_social), profiles(full_name)").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const range = useMemo(() => resolveRange(dateF.preset, dateF.from, dateF.to), [dateF]);
  const filtered = (data as any[]).filter((i) => inRange(i.created_at, range));
  return (
    <div>
      <PageHeader title="Interações" description="Últimos registros de comunicação com clientes." />
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeFilter value={dateF} onChange={setDateF} label="Data" />
          <Button variant="ghost" size="sm" onClick={() => setDateF(EMPTY_DATE_FILTER)}>Limpar filtros</Button>
        </div>
      </Card>
      <Card className="p-5">
        {filtered.length === 0 ? <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sem interações" /> : (
          <ul className="space-y-3">
            {filtered.map((i: any) => (
              <li key={i.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{labelOf(INTERACTION_TYPES, i.tipo)} · {i.profiles?.full_name ?? "—"}</span>
                  <span>{formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: ptBR })}</span>
                </div>
                <div className="mt-1 text-sm">{i.descricao}</div>
                <Link to="/clientes/$id" params={{ id: i.client_id }} className="mt-2 inline-block text-xs text-secondary hover:underline">
                  {i.clients?.razao_social}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
