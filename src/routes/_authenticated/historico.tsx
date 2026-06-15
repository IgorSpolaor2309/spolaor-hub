import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/sc/EmptyState";
import { History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/historico")({
  component: HistoryPage,
});

function HistoryPage() {
  const { userId } = useCurrentUser();
  const { data = [] } = useQuery({
    queryKey: ["my-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: cs } = await supabase.from("clients").select("id").eq("owner_profile_id", userId!);
      const ids = (cs ?? []).map((c) => c.id); if (!ids.length) return [];
      return (await supabase.from("timeline_events").select("*").in("client_id", ids).order("created_at", { ascending: false }).limit(100)).data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="Histórico" description="Linha do tempo das suas movimentações na plataforma." />
      <Card className="p-5">
        {data.length === 0 ? <EmptyState icon={<History className="h-6 w-6" />} title="Sem histórico" /> : (
          <ol className="space-y-4">
            {data.map((e: any) => (
              <li key={e.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                <div>
                  <div className="text-sm">{e.descricao}</div>
                  <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
