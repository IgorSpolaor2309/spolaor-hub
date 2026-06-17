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
  const { userId, loading } = useCurrentUser();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["my-history", userId],
    enabled: !loading && !!userId,
    retry: 1,
    queryFn: async () => {
      // RLS multiempresa: lista todos os client_ids visíveis ao usuário.
      const { data: cs, error: cErr } = await supabase.from("clients").select("id");
      if (cErr) throw cErr;
      const ids = (cs ?? []).map((c) => c.id); if (!ids.length) return [];
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*, clients(razao_social, nome_fantasia)")
        .in("client_id", ids)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="Histórico" description="Linha do tempo das suas movimentações na plataforma." />
      <Card className="p-5">
        {error ? <EmptyState icon={<History className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />
        : isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : data.length === 0 ? <EmptyState icon={<History className="h-6 w-6" />} title="Sem histórico" /> : (
          <ol className="space-y-4">
            {data.map((e: any) => (
              <li key={e.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                <div>
                  <div className="text-sm">{e.descricao}</div>
                  <div className="text-xs text-muted-foreground">
                    {(e.clients?.nome_fantasia || e.clients?.razao_social) && (
                      <>Empresa: {e.clients?.nome_fantasia || e.clients?.razao_social} · </>
                    )}
                    {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ptBR })}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
