import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ClipboardList, Info, Sparkles } from "lucide-react";
import type { NeedToRequestDiagnostic } from "@/lib/documentos/workspace-types";

type Props = {
  data: NeedToRequestDiagnostic | undefined;
  loading: boolean;
  error: Error | null;
  onGoToChecklist: () => void;
};

/**
 * Painel exclusivo da aba "Precisa solicitar" — apresenta um diagnóstico,
 * NÃO uma lista. A criação de solicitações continua no fluxo do Checklist.
 */
export function NeedToRequestPanel({ data, loading, error, onGoToChecklist }: Props) {
  if (loading) {
    return (
      <Card className="p-6 space-y-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Não foi possível carregar o diagnóstico.</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </Card>
    );
  }
  if (!data) return null;

  const elegiveis = data.elegiveis ?? 0;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium">Itens do checklist que precisam virar solicitação</h3>
          <p className="text-sm text-muted-foreground">
            Estes números vêm da mesma regra usada pelo módulo Checklist. A criação
            das solicitações continua acontecendo lá — a Central só mostra o diagnóstico.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <Stat label="Elegíveis para solicitação" value={elegiveis} highlight />
            <Stat label="Já com solicitação ativa" value={data.ja_com_request_ativo ?? 0} />
            <Stat label="Já com documento" value={data.ja_com_documento ?? 0} />
          </div>

          {data.criterio && (
            <p className="text-xs text-muted-foreground mt-3 inline-flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5" />
              <span>{data.criterio}</span>
            </p>
          )}

          <div className="mt-4">
            <Button onClick={onGoToChecklist} className="gap-2" disabled={elegiveis === 0}>
              <ClipboardList className="h-4 w-4" />
              Abrir Checklist para criar solicitações
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/20" : ""}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
