import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/sc/EmptyState";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minha-area")({
  component: MyAreaPage,
});

function MyAreaPage() {
  const { userId } = useCurrentUser();
  const { data: clients = [] } = useQuery({
    queryKey: ["my-clients", userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.from("clients").select("*").eq("owner_profile_id", userId!)).data ?? [],
  });
  return (
    <div>
      <PageHeader title="Minha área" description="Suas informações na Spolaor Company." />
      {clients.length === 0 ? <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Sem vínculo de cliente" description="Aguarde a equipe da Spolaor vincular sua conta." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((c) => (
            <Card key={c.id} className="p-5">
              <div className="font-display text-xl">{c.razao_social}</div>
              {c.nome_fantasia && <div className="text-sm text-muted-foreground">{c.nome_fantasia}</div>}
              <div className="mt-4 text-sm">{c.documento}</div>
              <Link to="/minhas-pendencias" className="mt-3 inline-block text-sm text-secondary hover:underline">Ver minhas pendências →</Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
