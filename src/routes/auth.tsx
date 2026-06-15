import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { SpolaorLogo } from "@/components/sc/Logo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [firstUser, setFirstUser] = useState(false);

  useEffect(() => {
    // Detect if no admin exists yet → show bootstrap signup
    supabase.from("user_roles").select("id", { head: true, count: "exact" }).eq("role", "admin")
      .then(({ count }) => {
        if ((count ?? 0) === 0) { setFirstUser(true); setMode("signup"); }
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada com sucesso");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro de autenticação";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel institucional */}
      <div className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white">
            <SpolaorLogo className="h-10 w-10 object-contain" />
          </div>
          <div>
            <div className="font-display text-xl leading-none">SC Central</div>
            <div className="text-xs text-primary-foreground/70">Spolaor Company</div>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="font-display text-4xl leading-tight">
            Central operacional interna da Spolaor Company
          </h2>
          <p className="mt-4 text-primary-foreground/80">
            Gestão de clientes, documentos e pendências em um só lugar.
          </p>
        </div>
        <div className="text-xs text-primary-foreground/60">© Spolaor Company</div>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <SpolaorLogo className="h-20 w-20 object-contain" />
            <h1 className="mt-4 font-display text-2xl">SC Central</h1>
            <p className="text-sm text-muted-foreground">Spolaor Company</p>
          </div>

          <Card className="border-border/60 p-8 shadow-[var(--shadow-card)]">
            <h2 className="font-display text-2xl">
              {mode === "signin" ? "Entrar na plataforma" : firstUser ? "Criar conta de administrador" : "Criar conta"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {firstUser ? "Você será o primeiro administrador da SC Central." : "Acesse sua área da Spolaor Company."}
            </p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome completo</Label>
                  <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            {!firstUser && (
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {mode === "signin" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
              </button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
