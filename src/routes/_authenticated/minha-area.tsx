import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/sc/EmptyState";
import { Briefcase, FileText, Receipt, ClipboardList, MessageSquare } from "lucide-react";
import { clientLabel, clientSubLabel } from "@/lib/client-display";

export const Route = createFileRoute("/_authenticated/minha-area")({
  component: MyAreaPage,
});

function MyAreaPage() {
  const { userId } = useCurrentUser();
  const { data: clients = [] } = useQuery({
    queryKey: ["my-clients-area", userId],
    enabled: !!userId,
    // RLS filtra: cliente vê só as empresas em que está vinculado
    // (owner_profile_id legado OU client_users ativo).
    queryFn: async () => (await supabase
      .from("clients")
      .select("id, razao_social, nome_fantasia, documento, status")
      .order("razao_social")).data ?? [],
  });

  return (
    <div>
      <PageHeader
        title="Minha área"
        description={clients.length > 1
          ? `Você tem acesso a ${clients.length} empresas.`
          : "Suas informações na Spolaor Company."}
      />
      {clients.length === 0 ? (
        <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Sem vínculo de cliente" description="Aguarde a equipe da Spolaor vincular sua conta." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((c) => {
            const sub = clientSubLabel(c);
            return (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display text-xl">{clientLabel(c)}</div>
                    {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
                    {c.documento && (!sub || sub !== c.documento) && (
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{c.documento}</div>
                    )}
                  </div>
                  {c.status && (
                    <Badge variant={c.status === "active" ? "secondary" : "outline"} className="shrink-0">
                      {c.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link to="/solicitacoes" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <FileText className="h-3.5 w-3.5" /> Solicitações
                  </Link>
                  <Link to="/guias" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Receipt className="h-3.5 w-3.5" /> Guias
                  </Link>
                  <Link to="/minhas-pendencias" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <ClipboardList className="h-3.5 w-3.5" /> Pendências
                  </Link>
                  <Link to="/interacoes" search={{ client: c.id }} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <MessageSquare className="h-3.5 w-3.5" /> Chat
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
