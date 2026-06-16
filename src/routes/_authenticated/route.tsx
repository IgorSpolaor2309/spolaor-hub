import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
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
import { ShieldAlert, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const { ready, loading, hasRole, userId, mustChangePassword, refetch } = useCurrentUser();

  if (!ready || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (userId && mustChangePassword) {
    return <ChangePasswordScreen onDone={() => refetch?.()} />;
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
        <h1 className="font-display text-xl">Sua conta ainda não está configurada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre em contato com o administrador da plataforma para liberar o seu acesso.
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
