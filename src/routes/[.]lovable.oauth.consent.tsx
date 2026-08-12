import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/sc/Logo";

// Typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResult = { data: OAuthDetails | null; error: { message: string } | null };
const oauthApi = () =>
  (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
      approveAuthorization: (id: string) => Promise<OAuthResult>;
      denyAuthorization: (id: string) => Promise<OAuthResult>;
    };
  }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md p-6">
        <h1 className="mb-2 font-display text-xl">Não foi possível carregar esta autorização</h1>
        <p className="text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </Card>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as OAuthDetails | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "aplicativo externo";
  const redirectUri = details?.client?.redirect_uri;
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <AppLogo className="h-10 w-10 object-contain" />
          <div>
            <div className="font-display text-lg leading-none">Digital SC</div>
            <div className="text-xs text-muted-foreground">Autorização de acesso</div>
          </div>
        </div>

        <h1 className="font-display text-2xl">Conectar {clientName} à sua conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ao aprovar, <strong>{clientName}</strong> poderá usar as ferramentas da Digital SC como você,
          respeitando seu papel e as políticas de acesso.
        </p>

        {redirectUri && (
          <p className="mt-3 break-all text-xs text-muted-foreground">
            Redireciona para: <code>{redirectUri}</code>
          </p>
        )}

        {scopes.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium text-muted-foreground">Permissões solicitadas</div>
            <ul className="mt-1 space-y-1 text-sm">
              {scopes.map((s) => (
                <li key={s} className="rounded bg-muted px-2 py-1 text-xs">{s}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          Isto não substitui as políticas de acesso da Digital SC. As ferramentas continuam limitadas
          ao que seu usuário pode ver e fazer.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            Aprovar
          </Button>
          <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
            Recusar
          </Button>
        </div>
      </Card>
    </div>
  );
}
