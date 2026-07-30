import { ArrowRight, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { legacyNoticeCopy, legacyNoticeCta, type LegacyAudience, type LegacyRoute } from "@/lib/legacy-routes";

/**
 * Fase 7 / C2 — aviso visível nas rotas legadas.
 * Puramente apresentacional: telemetria e redirect vivem no hook
 * `useLegacyRouteDeprecation`. O copy e o CTA variam por perfil.
 */
export function LegacyRouteNotice({
  route,
  onOpenCentral,
  audience = "staff",
}: {
  route: LegacyRoute;
  onOpenCentral: () => void;
  audience?: LegacyAudience;
}) {
  const copy = legacyNoticeCopy(route, audience);

  return (
    <Alert data-testid="legacy-route-notice" data-legacy-route={route} data-legacy-audience={audience} className="mb-4">
      <Info className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p className="mb-3">{copy.description}</p>
        <Button size="sm" onClick={onOpenCentral} data-testid="legacy-open-central">
          {legacyNoticeCta(audience)}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}
