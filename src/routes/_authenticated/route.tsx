import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sc/AppSidebar";
import { AppHeader } from "@/components/sc/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpolaorLogo } from "@/components/sc/Logo";
import { ShieldAlert, KeyRound, Loader2, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { reportLovableError } from "@/lib/lovable-error-reporting";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw redirect({ to: "/auth" });
      return { user: data.session.user };
    } catch (err) {
      // Sempre repropaga redirects do router; engole erros transitórios de
      // leitura de sessão para que o layout renderize loading/erro amigável
      // em vez de derrubar para a Error Boundary raiz.
      if (err && typeof err === "object" && "to" in (err as Record<string, unknown>)) throw err;
      console.warn("[_authenticated.beforeLoad] sessão indisponível:", err);
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthedLayout,
  pendingComponent: () => <LoadingScreen />,
  errorComponent: AuthedErrorBoundary,
});

function LoadingScreen({ message = "Carregando informações..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {message}
    </div>
  );
}

function AuthedErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[AuthedLayout] erro capturado:", error);
    reportLovableError(error, { boundary: "authenticated_layout" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="font-display text-xl">Não foi possível carregar esta página</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tente novamente em instantes. Se o problema continuar, contate o administrador.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Tentar novamente
          </Button>
          <Button variant="outline" onClick={() => router.navigate({ to: "/" })}>
            Voltar ao início
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AuthedLayout() {
  const { ready, loading, hasRole, role, userId, mustChangePassword, refetch } = useCurrentUser();

  const needsLink = role === "client" || role === "collaborator";

  // Verifica vínculo apenas para client/collaborator. Admin nunca precisa.
  // Erros de RLS / rede não bloqueiam o acesso.
  const linkQuery = useQuery({
    queryKey: ["user-link", userId, role],
    enabled: !!userId && needsLink,
    retry: 0,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        if (role === "collaborator") {
          const { data } = await supabase
            .from("collaborators")
            .select("id")
            .eq("user_id", userId!)
            .maybeSingle();
          return { hasLink: !!data?.id };
        }
        if (role === "client") {
          // RLS já filtra por user_has_client_access (owner_profile_id legado
          // OU client_users ativo). Basta haver pelo menos um cliente visível.
          const { data } = await supabase.from("clients").select("id").limit(1);
          return { hasLink: !!(data && data.length > 0) };
        }
        return { hasLink: true };
      } catch (err) {
        console.warn("[AuthedLayout] verificação de vínculo falhou:", err);
        return { hasLink: true };
      }
    },
  });

  if (!ready || loading) return <LoadingScreen message="Preparando sua área..." />;

  if (userId && mustChangePassword) {
    return <ChangePasswordScreen onDone={() => refetch?.()} />;
  }

  if (userId && !hasRole) {
    return <NoRoleScreen />;
  }

  if (needsLink && linkQuery.isLoading) {
    return <LoadingScreen message="Preparando sua área..." />;
  }
  if (needsLink && linkQuery.data && !linkQuery.data.hasLink) {
    return <MissingLinkScreen />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster richColors closeButton position="top-right" />
    </SidebarProvider>
  );
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/auth";
}

function NoRoleScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <SpolaorLogo className="mx-auto mb-2 h-10 w-10" />
        <h1 className="font-display text-xl">Acesso aguardando configuração</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta foi criada, mas ainda precisa ser configurada por um administrador.
        </p>
        <Button className="mt-6 w-full" variant="outline" onClick={signOut}>
          Sair
        </Button>
      </Card>
    </div>
  );
}

function MissingLinkScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-info/15 text-info">
          <LinkIcon className="h-7 w-7" />
        </div>
        <SpolaorLogo className="mx-auto mb-2 h-10 w-10" />
        <h1 className="font-display text-xl">Acesso ainda não vinculado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sua conta possui um perfil de acesso, mas ainda não foi vinculada corretamente.
          Solicite ao administrador a configuração do seu acesso.
        </p>
        <Button className="mt-6 w-full" variant="outline" onClick={signOut}>
          Sair
        </Button>
      </Card>
    </div>
  );
}

function ChangePasswordScreen({ onDone }: { onDone: () => void }) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < 8) {
      toast.error("A nova senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (pwd !== confirm) {
      toast.error("As senhas informadas não conferem.");
      return;
    }
    if (pwd === "Spolaor@123") {
      toast.error("Escolha uma nova senha, diferente da senha provisória.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc("mark_password_changed");
      if (rpcErr) throw rpcErr;
      toast.success("Senha alterada com sucesso.");
      onDone();
    } catch (err) {
      toast.error("Não foi possível alterar a senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-7 w-7" />
        </div>
        <div className="text-center">
          <SpolaorLogo className="mx-auto mb-2 h-10 w-10" />
          <h1 className="font-display text-xl">Defina sua senha de acesso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você precisa alterar a senha provisória antes de continuar.
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-pwd">Nova senha</Label>
            <Input
              id="new-pwd"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-pwd">Confirmar nova senha</Label>
            <Input
              id="confirm-pwd"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </form>

        <Button variant="ghost" className="mt-3 w-full" onClick={signOut}>
          Sair
        </Button>
      </Card>
    </div>
  );
}
