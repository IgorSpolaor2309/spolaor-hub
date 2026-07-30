import { computeProgress, progressInputsFromPortal } from "@/lib/competence-progress";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/sc/EmptyState";
import { Briefcase, FileText, Receipt, ClipboardList, MessageSquare, CalendarClock, ArrowRight } from "lucide-react";
import { clientLabel, clientSubLabel } from "@/lib/client-display";
import { currentCompetencia, formatCompetenciaLong } from "@/lib/competencia";
import { clientStatusLabel, clientStatusTone } from "@/lib/competence-client-labels";

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
      .is("deleted_at", null)
      .neq("status", "inactive")
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

                <CurrentCompetenceBlock clientId={c.id} />

                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link to="/meus-documentos" search={{ section: "precisa_enviar", client: clientId } as any} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <FileText className="h-3.5 w-3.5" /> Solicitações
                  </Link>
                  <Link to="/guias" search={{ client: undefined, comp: undefined }} className="inline-flex items-center gap-1 text-primary hover:underline">
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

function CurrentCompetenceBlock({ clientId }: { clientId: string }) {
  const comp = currentCompetencia();
  const q = useQuery({
    queryKey: ["portal-competence-card", clientId, comp],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_client_competence_portal", {
        p_client_id: clientId,
        p_competence: comp,
      });
      if (error) throw error;
      return data as {
        has_competence: boolean;
        status: string | null;
        progress_inputs: unknown;
        updated_at: string | null;
        reopened: boolean;
      };
    },
  });

  return (
    <div className="mt-4 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> {formatCompetenciaLong(comp)}
        </div>
        {q.data && (
          <Badge className={clientStatusTone(q.data.status)}>{clientStatusLabel(q.data.status)}</Badge>
        )}
      </div>
      {q.isLoading ? (
        <div className="mt-2 text-xs text-muted-foreground">Carregando…</div>
      ) : q.data && !q.data.has_competence ? (
        <div className="mt-2 text-xs text-muted-foreground">
          Esta competência ainda não foi iniciada pelo escritório.
        </div>
      ) : q.data ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Progress value={computeProgress(progressInputsFromPortal(q.data.progress_inputs)).percent} className="h-2 flex-1" />
            <div className="text-sm font-semibold">{computeProgress(progressInputsFromPortal(q.data.progress_inputs)).percent}%</div>
          </div>
          {q.data.reopened && (
            <div className="mt-1 text-[11px] text-orange-700">
              Esta competência foi reaberta para ajustes.
            </div>
          )}
        </>
      ) : null}
      <div className="mt-2 text-right">
        <Link
          to="/meu-mes/$clientId/$competence"
          params={{ clientId, competence: comp }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Ver detalhes <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
