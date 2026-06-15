import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/sc/EmptyState";
import { MessageSquare } from "lucide-react";
import { INTERACTION_TYPES, labelOf } from "@/lib/sc-types";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/interacoes")({
  component: InteractionsPage,
});

function InteractionsPage() {
  const { data = [] } = useQuery({
    queryKey: ["all-inter"],
    queryFn: async () => (await supabase.from("interactions").select("*, clients(razao_social), profiles(full_name)").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <div>
      <PageHeader title="Interações" description="Últimos registros de comunicação com clientes." />
      <Card className="p-5">
        {data.length === 0 ? <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sem interações" /> : (
          <ul className="space-y-3">
            {data.map((i: any) => (
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
