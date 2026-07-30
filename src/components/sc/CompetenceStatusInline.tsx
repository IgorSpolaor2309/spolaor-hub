// Fase A2 — Status oficial da competência exibido inline (substitui o antigo
// MonthStatusSelector, que gravava na tabela depreciada client_month_status).
// Fonte oficial única: public.client_competences.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock } from "lucide-react";
import { OFFICIAL_LABEL, OFFICIAL_TONE, type OfficialStatus } from "@/lib/competence-status";

export function currentCompetence(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Bloco compacto para a equipe (admin/colaborador): status oficial da
 * competência corrente, responsável e link para o detalhe oficial.
 */
export function CompetenceStatusInline({
  clientId,
  showResponsible = true,
}: {
  clientId: string;
  showResponsible?: boolean;
}) {
  const competence = currentCompetence();

  const { data, isLoading } = useQuery({
    queryKey: ["competence-inline", clientId, competence],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_competences")
        .select("id, status, responsible_profile_id")
        .eq("client_id", clientId)
        .eq("competence", competence)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const responsibleId = (data as any)?.responsible_profile_id as string | null | undefined;
  const { data: responsible } = useQuery({
    queryKey: ["competence-inline-resp", responsibleId],
    enabled: !!responsibleId && showResponsible,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", responsibleId!)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) {
    return <span className="text-xs text-muted-foreground">Carregando competência…</span>;
  }

  const status = (data as any)?.status as OfficialStatus | undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Competência {competence}:</span>
      {status ? (
        <Badge className={OFFICIAL_TONE[status]}>{OFFICIAL_LABEL[status]}</Badge>
      ) : (
        <Badge variant="outline">Competência não iniciada</Badge>
      )}
      {showResponsible && status && (
        <span className="text-xs text-muted-foreground">
          Responsável: {responsible?.full_name || responsible?.email || "—"}
        </span>
      )}
      <Button asChild variant="outline" size="sm">
        <Link to="/competencias/$clientId/$competence" params={{ clientId, competence }}>
          <CalendarClock className="mr-2 h-4 w-4" /> Ver competência
        </Link>
      </Button>
    </div>
  );
}
