import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sc/AppSidebar";
import { AppHeader } from "@/components/sc/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpolaorLogo } from "@/components/sc/Logo";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { ready, loading, hasRole, userId } = useCurrentUser();

  if (!ready || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (userId && !hasRole) {
    return <NoRoleScreen />;
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

function NoRoleScreen() {
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md p-8 text-center shadow-[var(--shadow-card)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <SpolaorLogo className="mx-auto mb-2 h-10 w-10" />
        <h1 className="font-display text-xl">Acesso aguardando configuração</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário foi identificado, mas ainda não possui um perfil de acesso definido.
          Solicite ao administrador da plataforma a liberação do seu acesso.
        </p>
        <Button className="mt-6 w-full" variant="outline" onClick={signOut}>
          Sair
        </Button>
      </Card>
    </div>
  );
}
