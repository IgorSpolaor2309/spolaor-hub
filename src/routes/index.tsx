import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppLogo } from "@/components/sc/Logo";
import { useQuery } from "@tanstack/react-query";
import { getPublicPlans, getPublicServices } from "@/lib/public-catalog.functions";
import { Check, ArrowRight, ShieldCheck, Clock, Inbox, FileText, Receipt, Users, UserCog, MessageSquare, Workflow, Briefcase } from "lucide-react";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const brl = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function LandingPage() {
  const plansQ = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
  });

  const servicesQ = useQuery({
    queryKey: ["public-services"],
    queryFn: () => getPublicServices(),
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header Fixo */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <AppLogo className="h-8 w-8" />
            <span className="font-display text-xl font-bold tracking-tight text-primary">Digital SC</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#funciona" className="text-muted-foreground hover:text-primary transition-colors">Como funciona</a>
            <a href="#planos" className="text-muted-foreground hover:text-primary transition-colors">Nossos planos</a>
            <a href="#servicos" className="text-muted-foreground hover:text-primary transition-colors">Serviços e especialidades</a>
            <a href="#duvidas" className="text-muted-foreground hover:text-primary transition-colors">Perguntas frequentes</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <a href="/auth" className="text-sm font-medium text-muted-foreground hover:text-primary">Já sou cliente</a>
            <Button size="sm" className="hidden sm:inline-flex" asChild>
              <a href="/auth">Abrir minha empresa</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
            Sua contabilidade começa <br className="hidden sm:block" />entendendo sua empresa.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
            Planos e serviços adaptados ao perfil do seu negócio, atendimento digital e acompanhamento em um só lugar.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
            <Button size="lg" className="w-full sm:w-auto">Quero abrir minha empresa</Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">Quero trocar de contador</Button>
          </div>
          <div className="mt-8 animate-in fade-in duration-1000 delay-500">
            <a href="#planos" className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1">
              Descobrir meu plano <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

        {/* Faixa de Posicionamento */}
        <section className="bg-primary/5 border-y py-12">
          <div className="container mx-auto px-4">
            <h2 className="text-center font-display text-2xl font-bold mb-10">Menos burocracia. Mais clareza sobre sua empresa.</h2>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="flex flex-col items-center text-center p-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Workflow className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-bold mb-2">100% digital</h3>
                <p className="text-sm text-muted-foreground">Processos modernos e ágeis, focados em tecnologia.</p>
              </div>
              <div className="flex flex-col items-center text-center p-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Receipt className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-bold mb-2">Planos claros</h3>
                <p className="text-sm text-muted-foreground">Estrutura comercial transparente e sem surpresas.</p>
              </div>
              <div className="flex flex-col items-center text-center p-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-bold mb-2">Acompanhamento Digital SC</h3>
                <p className="text-sm text-muted-foreground">Consultores especializados ao lado da sua empresa.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Ferramenta Inicial */}
        <section className="py-20 bg-background" id="funciona">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <h2 className="font-display text-3xl font-bold mb-4">Descubra a solução ideal para sua empresa</h2>
            <p className="text-muted-foreground mb-12">Escolha uma das opções abaixo para começarmos.</p>
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="p-6 cursor-pointer hover:border-primary transition-all group">
                <h3 className="font-bold mb-2 group-hover:text-primary transition-colors">Quero abrir uma empresa</h3>
                <p className="text-xs text-muted-foreground">Acompanhamento na abertura e nos primeiros passos da sua empresa.</p>
              </Card>
              <Card className="p-6 cursor-pointer hover:border-primary transition-all group">
                <h3 className="font-bold mb-2 group-hover:text-primary transition-colors">Trocar de contador</h3>
                <p className="text-xs text-muted-foreground">Transição organizada e acompanhada para a Digital SC.</p>
              </Card>
              <Card className="p-6 cursor-pointer hover:border-primary transition-all group" onClick={() => document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' })}>
                <h3 className="font-bold mb-2 group-hover:text-primary transition-colors">Conhecer os planos</h3>
                <p className="text-xs text-muted-foreground">Veja qual plano combina com o perfil e as necessidades da sua empresa.</p>
              </Card>
            </div>
          </div>
        </section>

        {/* Planos (Canônicos) */}
        <section className="py-20 bg-secondary/5" id="planos">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl font-bold mb-4">Nossos planos</h2>
              <p className="text-muted-foreground">Planos pensados para diferentes perfis e necessidades de negócio.</p>
            </div>

            {plansQ.isLoading ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-pulse">
                {[1, 2, 3, 4].map(i => <Card key={i} className="h-96 bg-muted/50" />)}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {(plansQ.data ?? []).map((plan: any) => {
                  const isDemais = plan.nome.toLowerCase() === 'demais';
                  const displayName = isDemais ? 'Solução personalizada' : plan.nome;
                  
                  return (
                    <Card key={plan.id} className={`p-6 flex flex-col relative overflow-hidden ${plan.nome === 'Plano C' ? 'ring-2 ring-primary' : ''}`}>
                      {plan.nome === 'Plano C' && (
                        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                          RECOMENDADO
                        </div>
                      )}
                      <div className="mb-6">
                        <h3 className="font-display text-xl font-bold">{displayName}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{plan.publico_alvo}</p>
                      </div>
                      <div className="mb-8">
                        <div className="text-3xl font-bold">
                          {plan.tipo_preco === 'sob_orcamento' ? 'Sob orçamento' : brl(plan.valor_padrao)}
                          {!isDemais && plan.tipo_preco !== 'sob_orcamento' && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
                        </div>
                        {plan.limite_faturamento && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            Até {brl(plan.limite_faturamento)} de faturamento/mês
                          </div>
                        )}
                      </div>
                      
                      <ul className="space-y-3 mb-8 flex-1">
                        {plan.plan_services?.filter((ps: any) => ps.tipo_inclusao === 'included').slice(0, 5).map((ps: any) => (
                          <li key={ps.id} className="text-xs flex items-start gap-2">
                            <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{ps.services?.nome}</span>
                          </li>
                        ))}
                      </ul>
                      
                      <Button variant={plan.nome === 'Plano C' ? 'default' : 'outline'} className="w-full">
                        {isDemais ? 'Falar com consultor' : 'Selecionar plano'}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Serviços */}
        <section className="py-20 bg-background" id="servicos">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl font-bold mb-4">Serviços e especialidades</h2>
              <p className="text-muted-foreground">Atendimento especializado em diversas áreas para apoiar a rotina contábil e manter sua empresa em conformidade.</p>
            </div>
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {servicesQ.data?.slice(0, 9).map((service: any) => (
                <div key={service.id} className="flex gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                   <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                     <Check className="h-4 w-4 text-primary" />
                   </div>
                   <div>
                     <h4 className="font-bold text-sm">{service.nome}</h4>
                     <p className="text-xs text-muted-foreground line-clamp-2">{service.descricao}</p>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">Pronto para cuidar da sua empresa de um jeito mais simples?</h2>
            <p className="text-primary-foreground/80 mb-10 max-w-xl mx-auto">Dê o próximo passo para uma contabilidade mais simples, digital e transparente.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
               <Button size="lg" variant="secondary" className="w-full sm:w-auto font-bold text-primary hover:bg-white focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary">Abrir minha empresa</Button>
               <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/20 hover:bg-white/10 text-white font-bold focus:ring-2 focus:ring-white">Trocar de contador</Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-zinc-950 text-zinc-400 py-16" id="duvidas">
        <div className="container mx-auto px-4 grid gap-12 md:grid-cols-4">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <AppLogo className="h-8 w-8 brightness-0 invert" />
              <span className="font-display text-xl font-bold text-white">Digital SC</span>
            </div>
            <p className="max-w-sm text-sm">
              Sua parceira na jornada digital. Contabilidade clara, ágil e focada no crescimento do seu negócio.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Links</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Sobre nós</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Planos</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Privacidade</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Segurança</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Contato</h4>
            <ul className="space-y-3 text-sm">
              <li>atendimento@digitalsc.com.br</li>
              <li>0800 000 0000</li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 mt-16 pt-8 border-t border-zinc-800 text-xs text-center">
          © 2026 Digital SC. Todos os direitos reservados. CNPJ 00.000.000/0000-00
        </div>
      </footer>
    </div>
  );
}
