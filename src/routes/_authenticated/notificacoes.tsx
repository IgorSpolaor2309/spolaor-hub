import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/sc/EmptyState";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { userId } = useCurrentUser();
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["notif", userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.from("notifications").select("*").eq("user_id", userId!).order("created_at", { ascending: false })).data ?? [],
  });
  const markAll = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("notifications").update({ lida: true }).eq("user_id", userId!).eq("lida", false); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notif", userId] }); qc.invalidateQueries({ queryKey: ["notif-unread", userId] }); },
  });
  return (
    <div>
      <PageHeader
        title="Notificações"
        description="Alertas internos da plataforma."
        action={<Button variant="outline" onClick={() => markAll.mutate()}><Check className="mr-2 h-4 w-4" /> Marcar todas como lidas</Button>}
      />
      <Card className="p-5">
        {data.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="Sem notificações" description="Você está em dia." /> : (
          <ul className="divide-y">
            {data.map((n: any) => (
              <li key={n.id} className="flex gap-3 py-3">
                <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lida ? "bg-muted" : "bg-warning"}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{n.titulo}</div>
                  {n.mensagem && <div className="text-sm text-muted-foreground">{n.mensagem}</div>}
                  <div className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
