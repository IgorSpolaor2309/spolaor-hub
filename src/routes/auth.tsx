import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AppLogo } from "@/components/sc/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function safeNext(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      if (search.next) throw redirect({ href: search.next });
      throw redirect({ to: "/" });
    }
  },
  component: AuthPage,
});


function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Enviamos um e-mail com as instruções para redefinir a senha.");
        setForgot(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (next) {
        window.location.replace(next);
        return;
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const friendly =
        /invalid login credentials/i.test(raw)
          ? "E-mail ou senha incorretos."
          : /email not confirmed/i.test(raw)
            ? "E-mail ainda não confirmado. Procure o administrador."
            : raw || "Não foi possível concluir a operação.";
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel institucional */}
      <div className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-auto min-w-[3.5rem] items-center justify-center rounded-lg bg-white p-2">
            <AppLogo className="h-10 w-auto" />
          </div>
          <div>
            <div className="font-display text-xl leading-none">Digital SC</div>
            <div className="text-xs text-primary-foreground/70">Sua contabilidade digital</div>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-4xl leading-tight">
            Central Operacional da Digital SC
          </h2>
          <p className="mt-4 text-primary-foreground/80">
            Gestão de clientes, documentos e pendências em um só lugar.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/60">© Digital SC</div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <AppLogo className="h-16 w-auto" />
            <h1 className="mt-4 font-display text-2xl">Digital SC</h1>
            <p className="text-sm text-muted-foreground">Central Operacional da Digital SC</p>
          </div>

          <Card className="border-border/60 p-8 shadow-[var(--shadow-card)]">
            <h2 className="font-display text-2xl">
              {forgot ? "Recuperar acesso" : "Entrar na plataforma"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {forgot
                ? "Informe seu e-mail para receber instruções de redefinição de senha."
                : "Acesso restrito a usuários autorizados."}
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {!forgot && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {forgot ? "Enviar instruções" : "Entrar"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setForgot((v) => !v)}
              className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              {forgot ? "Voltar para o login" : "Esqueci minha senha"}
            </button>

            <p className="mt-6 rounded-md border border-border/60 bg-muted/40 p-3 text-center text-xs text-muted-foreground">
              Caso ainda não tenha acesso, solicite ao administrador da plataforma.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
