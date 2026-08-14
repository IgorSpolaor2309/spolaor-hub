import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AppLogo } from "@/components/sc/Logo";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getPublicPlans, getPublicServices } from "@/lib/public-catalog.functions";
import { Check, ArrowRight, ShieldCheck, Clock, Inbox, FileText, Receipt, Users, UserCog, MessageSquare, Workflow, Briefcase, Info, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { OpeningChatFlow } from "@/components/opening/OpeningChatFlow";
import { SwitchingChatFlow } from "@/components/switching/SwitchingChatFlow";
import { safeTrackLead as trackJourney } from "@/lib/leads-client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import logoAsset from "@/assets/logo-spolaor.png.asset.json";
import foto1Asset from "@/assets/foto1.jpg.asset.json";
import foto3Asset from "@/assets/foto3.jpg.asset.json";
import foto4Asset from "@/assets/foto4.jpg.asset.json";
import foto5Asset from "@/assets/foto5.jpg.asset.json";
import foto6Asset from "@/assets/foto6.jpg.asset.json";
import foto7Asset from "@/assets/foto7.jpg.asset.json";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const brl = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface PlanCardItemProps {
  plan: any;
  prevPlan: any;
  isRecomendado: boolean;
  displayName: string;
  includedServices: any[];
  newServices: any[];
  onSelect: (planId: string) => void;
}

function PlanCardItem({ 
  plan, 
  prevPlan, 
  isRecomendado, 
  displayName, 
  includedServices, 
  newServices, 
  onSelect 
}: PlanCardItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <Card key={plan.id} className={`p-6 flex flex-col relative overflow-hidden transition-all hover:shadow-xl ${isRecomendado ? 'ring-2 ring-primary scale-105 z-10' : 'hover:scale-[1.02]'}`}>
      {isRecomendado && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg">
          RECOMENDADO
        </div>
      )}
      <div className="mb-6">
        <h3 className="font-display text-2xl font-bold">{displayName}</h3>
        <p className="text-sm text-muted-foreground mt-2 min-h-[40px] leading-snug">
          {plan.publico_alvo || "Solução ideal para sua empresa"}
        </p>
      </div>
      <div className="mb-8 border-b pb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">
            {plan.tipo_preco === 'sob_orcamento' ? 'Sob orçamento' : brl(plan.valor_padrao)}
          </span>
          {plan.tipo_preco !== 'sob_orcamento' && <span className="text-sm font-medium text-muted-foreground">/mês</span>}
        </div>
        {plan.limite_faturamento > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-primary font-medium mt-2 bg-primary/5 w-fit px-2 py-1 rounded">
            <Receipt className="h-3 w-3" />
            Faturamento até {brl(plan.limite_faturamento).replace(',00', '')}/mês
          </div>
        )}
      </div>
      
      <div className="space-y-4 mb-8 flex-1">
        {prevPlan && (
          <p className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Plus className="h-3 w-3" />
            Tudo do {prevPlan.nome}, mais:
          </p>
        )}
        
        <ul className="space-y-3">
          {(isExpanded ? includedServices : (prevPlan ? newServices : includedServices).slice(0, 5)).map((ps: any) => (
            <li key={ps.id} className="text-sm flex items-start gap-2 group">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  {ps.services?.nome}
                  {ps.tipo_inclusao === 'incluido_com_limite' && ps.limite_quantidade && (
                    <span className="text-[10px] ml-1 opacity-70">
                      ({ps.limite_quantidade} {ps.unidade_limite || 'un'})
                    </span>
                  )}
                </span>
                {ps.services?.descricao && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="text-muted-foreground hover:text-primary transition-colors">
                          <Info className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-xs">
                        {ps.services.descricao}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </li>
          ))}
        </ul>

        {includedServices.length > 5 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-primary text-xs font-bold hover:underline flex items-center gap-1 w-fit mt-2"
          >
            {isExpanded ? (
              <>Ver menos <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>Ver tudo que está incluído <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </div>
      
      <Button 
        variant={isRecomendado ? 'default' : 'outline'} 
        size="lg"
        className={cn(
          "w-full font-bold transition-all",
          isRecomendado ? "shadow-lg shadow-primary/20 hover:shadow-primary/30" : ""
        )} 
        onClick={() => onSelect(plan.id)}
      >
        Selecionar plano
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Card>
  );
}

function LandingPage() {
  const [showOpeningFlow, setShowOpeningFlow] = useState(false);
  const [showSwitchingFlow, setShowSwitchingFlow] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showPlanChoice, setShowPlanChoice] = useState(false);
  const { role, userId, loading } = useCurrentUser();
  const navigate = useNavigate();
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [showPersonalizedDialog, setShowPersonalizedDialog] = useState(false);
  const [personalizedContactType, setPersonalizedContactType] = useState<'whatsapp' | 'videoconference' | null>(null);
  const WHATSAPP_NUMBER = "5513997626359"; // Configurable number

  const heroImages = [
    { url: foto4Asset.url, alt: "Ambiente amplo com mesa branca e divisórias de vidro" },
    { url: foto7Asset.url, alt: "Mesa longa central com salas de vidro" },
    { url: foto1Asset.url, alt: "Sala com mesa branca próxima às janelas" },
    { url: foto6Asset.url, alt: "Sala de reunião escura com mesa preta" }
  ];

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setCurrentHeroIndex((prev) => (prev + 1) % heroImages.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [heroImages.length, isAutoPlaying]);

  const handleManualNav = (index: number) => {
    setCurrentHeroIndex(index);
    setIsAutoPlaying(false);
    // Reinicia o autoplay após um tempo de inatividade
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const handleClientAreaClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;

    if (userId) {
      if (role === 'admin' || role === 'collaborator') {
        navigate({ to: "/dashboard" });
      } else if (role === 'client') {
        navigate({ to: "/meu-mes" });
      } else {
        navigate({ to: "/dashboard" });
      }
    } else {
      navigate({ to: "/auth", search: { next: window.location.pathname } });
    }
  };

  const handlePlanSelection = (planId: string) => {
    setSelectedPlanId(planId);
    setShowPlanChoice(true);
  };

  const startFlow = (type: 'opening' | 'switching') => {
    if (type === 'opening') {
      setShowOpeningFlow(true);
    } else {
      setShowSwitchingFlow(true);
    }
    setShowPlanChoice(false);
  };

  const handlePersonalizedSolution = async (channel: 'whatsapp' | 'videoconference') => {
    setPersonalizedContactType(channel);
    
    // Register the lead request
    try {
      await trackJourney({
        data: {
          journeyStep: 'solicitacao_personalizada',
          interestedInPersonalized: true,
          preferredChannel: channel,
          lastInteraction: `Solicitou proposta personalizada via ${channel === 'whatsapp' ? 'WhatsApp' : 'Videoconferência'}`,
          origin: 'landing_personalized'
        }
      });
      
      if (channel === 'whatsapp') {
        const message = encodeURIComponent(`Olá! Vim pelo site da Digital SC e gostaria de conversar sobre uma solução contábil personalizada para minha empresa.`);
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');
      } else {
        toast.success("Solicitação de videoconferência registrada! Nossa equipe entrará em contato em breve.");
      }
    } catch (err) {
      console.error("Error tracking personalized lead:", err);
    }
    
    setShowPersonalizedDialog(false);
  };

  const plansQ = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const data = await getPublicPlans();
      if (!data || data.length === 0) {
        console.warn("[CLIENT] getPublicPlans returned no data");
      }
      return data;
    },
    staleTime: 1000 * 60 * 60,
  });

  const servicesQ = useQuery({
    queryKey: ["public-services"],
    queryFn: () => getPublicServices(),
    staleTime: 1000 * 60 * 60,
  });

  const filteredPlans = useMemo(() => {
    const rawData = plansQ.data || [];
    console.log("[CLIENT] Filtering plans, raw count:", rawData.length);
    const filtered = rawData
      .filter((p: any) => p.status === 'ativo' && !p.nome.startsWith('TEMP_') && p.nome !== 'Demais')
      .sort((a: any, b: any) => {
        const order = { 'Plano A': 1, 'Plano B': 2, 'Plano C': 3, 'Plano D': 4 };
        return (order[a.nome as keyof typeof order] || 99) - (order[b.nome as keyof typeof order] || 99);
      });
    console.log("[CLIENT] Filtered plans count:", filtered.length);
    return filtered;
  }, [plansQ.data]);

  if (showOpeningFlow || showSwitchingFlow) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto h-16 flex items-center px-4">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src={logoAsset.url} alt="Digital SC" className="h-10 w-auto" />
              <span className="font-display text-xl font-bold text-primary">Digital SC</span>
            </Link>
          </div>
        </header>
        <main className="flex-1 py-12">
          {showOpeningFlow && <OpeningChatFlow onBack={() => { setShowOpeningFlow(false); setSelectedPlanId(null); }} preSelectedPlanId={selectedPlanId || undefined} />}
          {showSwitchingFlow && <SwitchingChatFlow onBack={() => { setShowSwitchingFlow(false); setSelectedPlanId(null); }} preSelectedPlanId={selectedPlanId || undefined} />}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header Fixo */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src={logoAsset.url} alt="Digital SC" className="h-12 w-auto" />
            <span className="font-display text-xl font-bold tracking-tight text-primary">Digital SC</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#funciona" className="text-muted-foreground hover:text-primary transition-colors">Como funciona</a>
            <a href="#planos" className="text-muted-foreground hover:text-primary transition-colors">Nossos planos</a>
            <a href="#servicos" className="text-muted-foreground hover:text-primary transition-colors">Serviços e especialidades</a>
            <a href="#duvidas" className="text-muted-foreground hover:text-primary transition-colors">Perguntas frequentes</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={handleClientAreaClick}
              className="text-sm font-medium text-muted-foreground hover:text-primary cursor-pointer"
            >
              Já sou cliente
            </button>
            <Button size="sm" className="hidden sm:inline-flex" asChild>
              <Link to="/auth" search={{ next: "/" }}>Abrir minha empresa</Link>
            </Button>
          </div>
        </div>
      </header>


      <main className="flex-1">
        {/* Hero Section com Carrossel */}
        <section className="relative h-[600px] md:h-[700px] flex items-center justify-center overflow-hidden">
          {/* Background Images Layer */}
          <div className="absolute inset-0 z-0">
            {heroImages.map((img, index) => (
              <div
                key={index}
                className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
                  index === currentHeroIndex ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  backgroundImage: `url(${img.url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                aria-hidden="true"
              />
            ))}
            {/* Overlays */}
            <div className="absolute inset-0 bg-[#000814]/60 backdrop-blur-[1.5px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/40" />
          </div>

          {/* Indicators / Bolinhas */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-3">
            {heroImages.map((_, index) => (
              <button
                key={index}
                onClick={() => handleManualNav(index)}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-all duration-300",
                  index === currentHeroIndex 
                    ? "bg-white w-6" 
                    : "bg-white/40 hover:bg-white/60"
                )}
                aria-label={`Ir para slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Content Layer */}
          <div className="container relative z-10 mx-auto px-4 text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
              CONTABILIDADE QUE <br className="hidden sm:block" />CABE NO SEU BOLSO
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/90 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
              Planos e serviços adaptados ao perfil do seu negócio, atendimento digital e acompanhamento em um só lugar.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <Button size="lg" className="w-full sm:w-auto px-8" onClick={() => setShowOpeningFlow(true)}>Quero abrir minha empresa</Button>
              <Button size="lg" variant="secondary" className="w-full sm:w-auto px-8 bg-white/10 text-white border-white/20 hover:bg-white/20" onClick={() => setShowSwitchingFlow(true)}>Quero trocar de contador</Button>
            </div>
            <div className="mt-8 animate-in fade-in duration-1000 delay-500">
              <a href="#planos" className="text-sm font-medium text-white hover:underline inline-flex items-center gap-1">
                Descobrir meu plano <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
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
              <Card className="p-6 cursor-pointer hover:border-primary transition-all group" onClick={() => setShowOpeningFlow(true)}>
                <h3 className="font-bold mb-2 group-hover:text-primary transition-colors">Quero abrir uma empresa</h3>
                <p className="text-xs text-muted-foreground">Acompanhamento na abertura e nos primeiros passos da sua empresa.</p>
              </Card>
              <Card className="p-6 cursor-pointer hover:border-primary transition-all group" onClick={() => setShowSwitchingFlow(true)}>
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

        {/* Seção Nossa Estrutura */}
        <section className="py-24 bg-background overflow-hidden">
          <div className="container mx-auto px-4">
            <div className="flex flex-col lg:flex-row gap-12 items-center">
              <div className="lg:w-1/3">
                <h2 className="font-display text-3xl font-bold mb-6">Estrutura real para cuidar da sua empresa</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Tecnologia torna o processo mais simples. Pessoas e uma estrutura preparada garantem o acompanhamento que sua empresa precisa.
                </p>
              </div>
              <div className="lg:w-2/3">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-full">
                  <div className="md:col-span-8">
                    <img 
                      src={foto7Asset.url} 
                      alt="Nossa estrutura central" 
                      className="w-full h-full object-cover rounded-2xl shadow-xl aspect-[16/10] md:aspect-auto"
                      loading="lazy"
                    />
                  </div>
                  <div className="md:col-span-4 flex flex-col gap-4">
                    <img 
                      src={foto3Asset.url} 
                      alt="Ambiente de madeira com aquário" 
                      className="w-full h-full object-cover rounded-2xl shadow-lg aspect-[16/9]"
                      loading="lazy"
                    />
                    <img 
                      src={foto1Asset.url} 
                      alt="Escritório próximo às janelas" 
                      className="w-full h-full object-cover rounded-2xl shadow-lg aspect-[16/9]"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
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

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {plansQ.isLoading ? (
                [1, 2, 3, 4].map(i => <Card key={i} className="h-96 bg-muted/50 animate-pulse" />)
              ) : filteredPlans.length === 0 ? (
                <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                  Carregando catálogo... (Plans: {plansQ.data?.length || 0})
                </div>
              ) : (
                filteredPlans.map((plan: any, index: number) => {
                  const prevPlan = index > 0 ? filteredPlans[index - 1] : null;
                  const isRecomendado = plan.nome === 'Plano B';
                  const displayName = plan.nome;
                  const includedServices = plan.plan_services || [];
                  const prevPlanServiceIds = new Set(prevPlan?.plan_services?.map((ps: any) => ps.service_id) || []);
                  const newServices = prevPlan 
                    ? includedServices.filter((ps: any) => !prevPlanServiceIds.has(ps.service_id))
                    : includedServices;

                  return (
                    <PlanCardItem 
                      key={plan.id}
                      plan={plan}
                      prevPlan={prevPlan}
                      isRecomendado={isRecomendado}
                      displayName={displayName}
                      includedServices={includedServices}
                      newServices={newServices}
                      onSelect={handlePlanSelection}
                    />
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* Seção Plano Personalizado */}
        <section className="py-12 bg-background border-t">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <h3 className="font-display text-2xl font-bold mb-4">Não encontrou o plano ideal para sua empresa?</h3>
            <p className="text-muted-foreground mb-8 text-lg">
              Montamos uma solução personalizada de acordo com a operação e as necessidades da sua empresa.
            </p>
            <Button 
              size="lg" 
              variant="outline" 
              className="px-8 border-primary text-primary hover:bg-primary/5 font-bold"
              onClick={() => setShowPersonalizedDialog(true)}
            >
              Quero uma proposta personalizada
            </Button>
          </div>
        </section>

        {/* Dialog de escolha de fluxo quando plano é selecionado */}
        <Dialog open={showPlanChoice} onOpenChange={setShowPlanChoice}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center font-display text-xl">Como podemos ajudar sua empresa hoje?</DialogTitle>
              <DialogDescription className="text-center">
                Você selecionou o <strong>{plansQ.data?.find((p: any) => p.id === selectedPlanId)?.nome}</strong>. Qual o momento da sua empresa?
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 py-4">
              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-1 items-center justify-center hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => startFlow('opening')}
              >
                <div className="font-bold">Abrir minha empresa</div>
                <div className="text-[10px] text-muted-foreground font-normal">Ainda não tenho CNPJ e quero começar agora</div>
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-1 items-center justify-center hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => startFlow('switching')}
              >
                <div className="font-bold">Trocar de contador</div>
                <div className="text-[10px] text-muted-foreground font-normal">Já tenho empresa e quero migrar para a Digital SC</div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Solução Personalizada */}
        <Dialog open={showPersonalizedDialog} onOpenChange={setShowPersonalizedDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center font-display text-xl">Como prefere ser atendido?</DialogTitle>
              <DialogDescription className="text-center">
                Escolha o melhor canal para conversarmos sobre sua proposta personalizada.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 py-4">
              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-1 items-center justify-center hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => handlePersonalizedSolution('videoconference')}
              >
                <div className="font-bold flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Agendar uma videoconferência
                </div>
                <div className="text-[10px] text-muted-foreground font-normal">Nossa equipe entrará em contato para marcar o horário</div>
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex flex-col gap-1 items-center justify-center hover:border-primary hover:bg-primary/5 transition-all"
                onClick={() => handlePersonalizedSolution('whatsapp')}
              >
                <div className="font-bold flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Falar com nossa equipe pelo WhatsApp
                </div>
                <div className="text-[10px] text-muted-foreground font-normal">Atendimento imediato via chat</div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* Seção Humana / Equipe */}
        <section className="py-24 bg-secondary/10">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <h2 className="font-display text-3xl font-bold mb-6">Tecnologia com atendimento de verdade</h2>
                <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                  A Digital SC combina automação e inteligência artificial com o acompanhamento de uma equipe preparada para cuidar da rotina da sua empresa.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={() => setShowOpeningFlow(true)}>Abrir empresa</Button>
                  <Button variant="outline" onClick={() => setShowSwitchingFlow(true)}>Trocar de contador</Button>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <img 
                  src={foto5Asset.url} 
                  alt="Reunião com equipe Digital SC" 
                  className="w-full h-auto rounded-3xl shadow-2xl"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/10 rounded-full -ml-48 -mb-48 blur-3xl pointer-events-none" />
          
          <div className="container relative z-10 mx-auto px-4 text-center">
            <h2 className="font-display text-3xl md:text-5xl font-bold mb-6 text-white">
              Pronto para cuidar da sua empresa de um jeito mais simples?
            </h2>
            <p className="text-white/90 mb-12 max-w-2xl mx-auto text-lg md:text-xl leading-relaxed">
              Dê o próximo passo para uma contabilidade mais simples, digital e transparente.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
               <Button 
                size="lg" 
                className="w-full sm:w-auto px-10 h-14 text-base font-bold bg-[#0052FF] text-white hover:bg-[#0041CC] shadow-xl transition-all" 
                onClick={() => setShowOpeningFlow(true)}
               >
                 Abrir minha empresa
               </Button>
               <Button 
                size="lg" 
                variant="secondary" 
                className="w-full sm:w-auto px-10 h-14 text-base font-bold bg-white text-[#000000] border border-white hover:bg-primary hover:text-white hover:border-white/20 shadow-lg transition-all" 
                onClick={() => setShowSwitchingFlow(true)}
               >
                 Trocar de contador
               </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-zinc-950 text-zinc-400 py-16" id="duvidas">
        <div className="container mx-auto px-4 grid gap-12 md:grid-cols-4">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <img src={logoAsset.url} alt="Digital SC" className="h-10 w-auto" />
              <span className="font-display text-xl font-bold text-white">Digital SC</span>
            </div>
            <p className="max-w-sm text-sm">
              Contabilidade digital, clara e organizada para você acompanhar sua empresa de perto.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6 text-sm">Rodapé</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Sobre nós</a></li>
              <li><a href="#planos" className="hover:text-white transition-colors">Nossos planos</a></li>
              <li><a href="/privacidade" className="hover:text-white transition-colors">Privacidade</a></li>
              <li><a href="/seguranca" className="hover:text-white transition-colors">Segurança</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6 text-sm">Contato</h4>
            <ul className="space-y-3 text-sm">
              <li>atendimento@digitalsc.com.br</li>
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 mt-16 pt-8 border-t border-zinc-800 text-xs text-center">
          © 2026 Digital SC. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
