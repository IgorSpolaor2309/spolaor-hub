import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, Check, Briefcase, TrendingUp, Building2, AlertCircle } from "lucide-react";
import { CheckoutView } from "@/components/commercial/CheckoutView";
import { SuccessScreen } from "@/components/commercial/SuccessScreen";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { processSwitchingMessage } from "@/lib/switching-chat.functions";
import { lookupCNPJ } from "@/lib/cnpj-lookup.functions";
import { useQuery } from "@tanstack/react-query";
import { getPublicPlans } from "@/lib/public-catalog.functions";
import { onlyDigits, isValidCnpjLength, validateCnpj } from "@/lib/cnpj";
import { trackLeadJourney } from "@/lib/leads.functions";

export function SwitchingChatFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'chat' | 'confirm' | 'diagnostic' | 'checkout' | 'success'>('chat');
  const [prospectId, setProspectId] = useState<string>("");
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: "Olá! Sou o assistente da Digital SC. Para começarmos a planejar sua migração, por favor, me informe o CNPJ da sua empresa." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [contact, setContact] = useState({ email: "", phone: "" });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const processMessage = useServerFn(processSwitchingMessage);
  const cnpjLookupFn = useServerFn(lookupCNPJ);
  const trackJourney = useServerFn(trackLeadJourney);
  
  const { data: plans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;
    
    setMessages(prev => [...prev, { role: 'user', content: trimmedInput }]);
    setInput("");
    setLoading(true);

    // Track initial interaction
    if (messages.length === 1) {
      trackJourney({ 
        data: { 
          journeyStep: 'conversa_iniciada',
          flowType: 'switching'
        } 
      }).then(res => setProspectId(res.prospectId)).catch(console.error);
    }

    try {
      // Regra: Se ainda não temos CNPJ e o input parece um CNPJ (ou contém um), tentamos validar via API real
      const digits = onlyDigits(trimmedInput);
      if (!extractedData?.cnpj && digits.length >= 11) {
        if (digits.length === 14) {
          if (!validateCnpj(digits)) {
            setMessages(prev => [...prev, { role: 'ai', content: "Este número não parece um CNPJ válido (falha no dígito verificador). Pode conferir?" }]);
            setLoading(false);
            return;
          }

          try {
            const companyData = await cnpjLookupFn({ data: { cnpj: digits } });
            setExtractedData((prev: any) => ({
              ...prev,
              cnpj: digits,
              business_name: companyData.razao_social || companyData.nome_fantasia,
              city: companyData.municipio,
              uf: companyData.uf,
              tax_regime: companyData.simples ? "Simples Nacional" : "Lucro Presumido" // Default guess based on simple opt-in
            }));
            
            const aiResponse = `Encontrei a empresa ${companyData.razao_social}${companyData.nome_fantasia ? ` (${companyData.nome_fantasia})` : ''} em ${companyData.municipio}/${companyData.uf}. É esta mesmo? Se sim, me conte qual o faturamento mensal médio dela.`;
            setMessages(prev => [...prev, { role: 'ai', content: aiResponse }]);
            setLoading(false);
            return;
          } catch (err: any) {
            setMessages(prev => [...prev, { role: 'ai', content: err.message || "Não consegui encontrar o CNPJ informado na base da Receita. Por favor, verifique o número." }]);
            setLoading(false);
            return;
          }
        } else if (digits.length > 0 && digits.length !== 14) {
           setMessages(prev => [...prev, { role: 'ai', content: "O CNPJ deve ter exatamente 14 dígitos. Pode conferir o número?" }]);
           setLoading(false);
           return;
        }
      }

      const result = await processMessage({ 
        data: { 
          context: trimmedInput,
          history: messages
        } 
      });
      
      setMessages(prev => [...prev, { role: 'ai', content: result.response }]);
      setExtractedData((prev: any) => {
        const newData = { ...prev, ...result.extractedData };
        if (result.extractedData.email) setContact(c => ({ ...c, email: result.extractedData.email }));
        if (result.extractedData.phone) setContact(c => ({ ...c, phone: result.extractedData.phone }));
        return newData;
      });
      
      if (result.status === "complete") {
        trackJourney({
          data: {
            prospectId,
            journeyStep: 'diagnostico_concluido',
            extractedData: result.extractedData
          }
        }).catch(console.error);
        setTimeout(() => setStep('confirm'), 2000);
      }
    } catch (e: any) {
      console.error(e);
      const errorMessage = e.message || "Desculpe, tive um problema técnico. Pode repetir?";
      setMessages(prev => [...prev, { role: 'ai', content: errorMessage }]);
    } finally {
      setLoading(false);
    }
  };

  const brl = (n: number | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getRecommendedPlan = () => {
    if (!plans || !extractedData) return null;
    const rev = extractedData.revenue || 0;
    if (rev <= 8000) return plans.find((p: any) => p.nome === 'Plano A');
    if (rev <= 15000) return plans.find((p: any) => p.nome === 'Plano B');
    if (rev <= 100000) return plans.find((p: any) => p.nome === 'Plano C');
    return plans.find((p: any) => p.nome === 'Plano D') || plans[0];
  };

  const getContactData = () => {
    return {
      name: extractedData?.name || contact.email.split('@')[0] || "Interessado",
      email: contact.email || extractedData?.email || "",
      phone: contact.phone || extractedData?.phone || ""
    };
  };

  if (step === 'confirm') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h2 className="font-display text-2xl font-bold mb-6 text-center">Entendi sua empresa assim</h2>
        <Card className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">CNPJ</label>
              <Input value={extractedData?.cnpj || ""} onChange={e => setExtractedData({...extractedData, cnpj: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Razão Social</label>
              <Input value={extractedData?.business_name || ""} onChange={e => setExtractedData({...extractedData, business_name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Faturamento Mensal</label>
              <Input type="number" value={extractedData?.revenue || ""} onChange={e => setExtractedData({...extractedData, revenue: Number(e.target.value)})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Motivo da Troca</label>
              <Input value={extractedData?.reason_for_switching || ""} onChange={e => setExtractedData({...extractedData, reason_for_switching: e.target.value})} />
            </div>
          </div>
          
          <div className="pt-4 border-t space-y-4">
            <p className="text-sm text-muted-foreground">Dados para contato futuro:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="E-mail" value={contact.email} onChange={e => setContact({...contact, email: e.target.value})} />
              <Input placeholder="Telefone (WhatsApp)" value={contact.phone} onChange={e => setContact({...contact, phone: e.target.value})} />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setStep('chat')}>Corrigir na conversa</Button>
            <Button className="flex-1" onClick={() => {
              const plan = getRecommendedPlan();
              trackJourney({
                data: {
                  prospectId,
                  journeyStep: 'plano_visualizado',
                  contactData: getContactData(),
                  planId: plan?.id,
                  estimatedValue: plan?.valor_padrao
                }
              }).catch(console.error);
              setStep('diagnostic');
            }}>Confirmar e ver proposta</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'diagnostic') {
    const plan = getRecommendedPlan();
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-in fade-in duration-700">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display text-3xl font-bold">Plano de Transição Digital SC</h2>
          <p className="text-muted-foreground mt-2">Veja como faremos a migração da sua contabilidade</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 p-6 space-y-8">
            <section>
              <h3 className="font-bold flex items-center gap-2 mb-4"><Building2 className="h-4 w-4 text-primary" /> Perfil Identificado</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Empresa</span>
                  {extractedData?.business_name}
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Faturamento</span>
                  {brl(extractedData?.revenue)}/mês
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Motivo da Troca</span>
                  <span className="capitalize">{extractedData?.reason_for_switching}</span>
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Regime Atual</span>
                  {extractedData?.tax_regime || "A definir"}
                </div>
              </div>
            </section>

            <section className="border-t pt-6">
              <h3 className="font-bold flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-primary" /> Próximos Passos da Troca</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <span><b>Solicitação de distrato:</b> Orientamos você no aviso ao contador atual.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <span><b>Coleta de documentos:</b> Nossa equipe cuida da importação do histórico contábil e fiscal.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <span><b>Onboarding:</b> Apresentação da plataforma e definição das rotinas de atendimento.</span>
                </li>
              </ul>
              <div className="mt-4 flex items-center gap-2 text-[11px] text-amber-600 bg-amber-50 p-2 rounded">
                <AlertCircle className="h-3 w-3" />
                <span>Nós cuidamos de toda a transição técnica para você não se preocupar.</span>
              </div>
            </section>
          </Card>

          <Card className="p-6 bg-primary text-primary-foreground flex flex-col">
            <h3 className="font-bold text-lg mb-2">Recomendação Comercial</h3>
            {plan ? (
              <>
                <div className="text-3xl font-bold mb-1">{plan.nome}</div>
                <div className="text-sm opacity-90 mb-6">{brl(plan.valor_padrao)}/mês</div>
                <div className="flex-1 space-y-3">
                  <p className="text-xs font-medium">Por que este plano?</p>
                  <p className="text-xs opacity-80 leading-relaxed">
                    Ideal para empresas com faturamento de até {brl(plan.limite_faturamento)}, garantindo suporte para suas necessidades de {extractedData?.segment?.toLowerCase() || 'negócio'}.
                  </p>
                  <ul className="space-y-2 mt-4">
                    {plan.plan_services?.filter((ps: any) => ps.tipo_inclusao === 'included').slice(0, 3).map((ps: any) => (
                      <li key={ps.id} className="text-[10px] flex items-center gap-2">
                        <Check className="h-3 w-3 shrink-0" />
                        {ps.services?.nome}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button variant="secondary" className="w-full mt-6 text-primary font-bold" onClick={() => {
                  trackJourney({
                    data: {
                      prospectId,
                      journeyStep: 'checkout_iniciado'
                    }
                  }).catch(console.error);
                  setStep('checkout');
                }}>Confirmar Migração</Button>
              </>
            ) : (
              <p>Carregando recomendação...</p>
            )}
          </Card>
        </div>
        
        <div className="text-center">
          <Button variant="link" onClick={onBack} className="text-muted-foreground">Voltar para a Home</Button>
        </div>
      </div>
    );
  }

  if (step === 'checkout') {
    const plan = getRecommendedPlan();
    return (
      <div className="animate-in fade-in duration-500">
        <div className="max-w-5xl mx-auto pt-8 px-4 flex items-center justify-between">
           <h1 className="font-display text-2xl font-bold">Finalizar Contratação</h1>
           <Button variant="ghost" onClick={() => setStep('diagnostic')}>Voltar ao diagnóstico</Button>
        </div>
        <CheckoutView 
          flowType="switching"
          initialPlanId={plan?.id}
          prospectId={prospectId}
          extractedData={extractedData}
          contactData={getContactData()}
          onBack={() => setStep('diagnostic')}
          onConfirm={(id) => {
            setProspectId(id);
            setStep('success');
          }}
        />
      </div>
    );
  }

  if (step === 'success') {
    const plan = getRecommendedPlan();
    return (
      <SuccessScreen 
        prospectId={prospectId}
        planName={plan?.nome || "Plano Selecionado"}
        onDone={onBack}
      />
    );
  }


  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col h-[700px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold">Trocar de contador</h2>
          <p className="text-sm text-muted-foreground">Fale sobre sua empresa atual</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 border rounded-t-lg bg-muted/10">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`p-4 rounded-2xl max-w-[85%] text-sm shadow-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-background border rounded-tl-none'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start animate-in fade-in">
             <div className="bg-background border p-4 rounded-2xl rounded-tl-none text-sm text-muted-foreground flex items-center gap-2">
               <Loader2 className="animate-spin h-3 w-3" />
               Analisando empresa...
             </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      
      <div className="p-4 border-x border-b rounded-b-lg bg-background flex gap-2">
        <Input 
          className="flex-1"
          value={input} 
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ex: Meu CNPJ é 12.345..."
          disabled={loading}
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      
      <p className="mt-4 text-[10px] text-center text-muted-foreground">
        Seus dados estão protegidos. A Digital SC garante total sigilo nas informações da transição.
      </p>
    </div>
  );
}
