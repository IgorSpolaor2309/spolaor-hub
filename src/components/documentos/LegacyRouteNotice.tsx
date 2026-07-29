import { ArrowRight, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LEGACY_NOTICE_COPY, type LegacyRoute } from "@/lib/legacy-routes";

/**
 * Fase 7 — aviso visível para staff nas rotas legadas.
 * Puramente apresentacional: telemetria e redirect vivem no hook
 * `useLegacyRouteDeprecation`.
 */
export function LegacyRouteNotice({
  route,
  onOpenCentral,
}: {
  route: LegacyRoute;
  onOpenCentral: () => void;
}) {
  const copy = LEGACY_NOTICE_COPY[route];

  return (
    <Alert data-testid="legacy-route-notice" data-legacy-route={route} className="mb-4">
      <Info className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{copy.description}</p>
        <Button size="sm" onClick={onOpenCentral} data-testid="legacy-open-central">
          Abrir Central de Documentos
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
