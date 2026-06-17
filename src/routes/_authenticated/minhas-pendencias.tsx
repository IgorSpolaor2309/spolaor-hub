import { createFileRoute } from "@tanstack/react-router";
import { formatBR } from "@/lib/dates";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minhas-pendencias")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const { userId } = useCurrentUser();
  const { data = [] } = useQuery({
    queryKey: ["my-tasks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: cs } = await supabase.from("clients").select("id").eq("owner_profile_id", userId!);
      const ids = (cs ?? []).map((c) => c.id); if (!ids.length) return [];
      return (await supabase.from("pending_tasks").select("*").in("client_id", ids).order("prazo")).data ?? [];
    },
  });
  return (
    <div>
      <PageHeader title="Minhas pendências" description="O que está aguardando você ou em andamento." />
      <Card className="p-5">
        {data.length === 0 ? <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Sem pendências" description="Você está em dia. 🎉" /> : (
          <ul className="space-y-2">
            {data.map((t: any) => (
              <li key={t.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{t.titulo}</div>
                  <div className="flex items-center gap-2"><PriorityBadge value={t.prioridade} /><StatusBadge value={t.status} /></div>
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
