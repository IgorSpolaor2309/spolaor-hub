import { createFileRoute, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppLogo } from "@/components/sc/Logo";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <AppLogo className="h-8 w-8" />
            <span className="font-display text-xl font-bold tracking-tight text-primary">Digital SC</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#funciona" className="text-muted-foreground hover:text-primary">Como funciona</a>
            <a href="#planos" className="text-muted-foreground hover:text-primary">Planos</a>
            <a href="#servicos" className="text-muted-foreground hover:text-primary">Serviços</a>
            <a href="#duvidas" className="text-muted-foreground hover:text-primary">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="/auth" className="hidden text-sm font-medium text-muted-foreground hover:text-primary md:block">Já sou cliente</a>
            <Button size="sm">Abrir minha empresa</Button>
            <Button size="sm" variant="outline">Trocar de contador</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-5xl font-bold tracking-tight text-foreground md:text-6xl">
            Sua contabilidade começa <br />entendendo sua empresa.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Planos e serviços adaptados ao perfil do seu negócio, atendimento digital e acompanhamento em um só lugar.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button size="lg">Quero abrir minha empresa</Button>
            <Button size="lg" variant="outline">Quero trocar de contador</Button>
          </div>
          <div className="mt-8">
            <a href="#planos" className="text-sm font-medium text-primary hover:underline">Descobrir meu plano</a>
          </div>
        </section>

        <section className="bg-secondary/10 py-12">
          <div className="container mx-auto grid gap-6 px-4 md:grid-cols-3 text-center">
            <div className="p-4"><h3 className="font-display text-xl font-bold">100% digital</h3><p className="text-sm text-muted-foreground">Processos ágeis e sem papéis.</p></div>
            <div className="p-4"><h3 className="font-display text-xl font-bold">Planos claros</h3><p className="text-sm text-muted-foreground">Preço justo e sem surpresas.</p></div>
            <div className="p-4"><h3 className="font-display text-xl font-bold">Acompanhamento Digital SC</h3><p className="text-sm text-muted-foreground">Clareza sobre sua empresa em tempo real.</p></div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © 2026 Digital SC. Todos os direitos reservados.
      </footer>
    </div>
  );
}
