import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowRight, Check, FileText, User, MapPin, Briefcase, TrendingUp, ShoppingCart } from "lucide-react";
import { CheckoutView } from "@/components/commercial/CheckoutView";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { processOpeningMessage } from "@/lib/opening-chat.functions";
import { useQuery } from "@tanstack/react-query";
import { getPublicPlans } from "@/lib/public-catalog.functions";

export function OpeningChatFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<'chat' | 'confirm' | 'diagnostic' | 'checkout'>('chat');
  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: "Olá! Sou o assistente da Digital SC. Me conte um pouco sobre o negócio que você pretende abrir. Por exemplo: 'Quero abrir uma hamburgueria em Santos com meu irmão'." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [contact, setContact] = useState({ email: "", phone: "" });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const processMessage = useServerFn(processOpeningMessage);
  
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
    
    const userMsg = trimmedInput;
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput("");
    setLoading(true);

    try {
      const result = await processMessage({
        data: { 
          context: userMsg,
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
        setTimeout(() => setStep('confirm'), 2000);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { role: 'ai', content: "Desculpe, tive um problema técnico. Pode repetir?" }]);
    } finally {
      setLoading(false);
    }
  };

  const brl = (n: number | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getRecommendedPlan = () => {
    if (!plans || !extractedData) return null;
    const rev = extractedData.revenue || 0;
    if (rev <= 15000) return plans.find((p: any) => p.nome === 'Plano A');
    if (rev <= 50000) return plans.find((p: any) => p.nome === 'Plano B');
    return plans.find((p: any) => p.nome === 'Plano C') || plans[0];
  };

  if (step === 'confirm') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h2 className="font-display text-2xl font-bold mb-6 text-center">Entendi seu negócio assim</h2>
        <Card className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Tipo de Negócio</label>
              <Input value={extractedData?.business_type || ""} onChange={e => setExtractedData({...extractedData, business_type: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Cidade/UF</label>
              <Input value={extractedData?.city || ""} onChange={e => setExtractedData({...extractedData, city: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Faturamento Mensal</label>
              <Input type="number" value={extractedData?.revenue || ""} onChange={e => setExtractedData({...extractedData, revenue: Number(e.target.value)})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground">Funcionários</label>
              <Input type="number" value={extractedData?.employees || ""} onChange={e => setExtractedData({...extractedData, employees: Number(e.target.value)})} />
            </div>
          </div>
          
          <div className="pt-4 border-t space-y-4">
            <p className="text-sm text-muted-foreground">Deixe seu contato para receber o diagnóstico completo:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input placeholder="E-mail" value={contact.email} onChange={e => setContact({...contact, email: e.target.value})} />
              <Input placeholder="Telefone (WhatsApp)" value={contact.phone} onChange={e => setContact({...contact, phone: e.target.value})} />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setStep('chat')}>Corrigir na conversa</Button>
            <Button className="flex-1" onClick={() => setStep('diagnostic')}>Confirmar e ver diagnóstico</Button>
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
          <h2 className="font-display text-3xl font-bold">Diagnóstico Digital SC</h2>
          <p className="text-muted-foreground mt-2">Veja os detalhes e próximos passos para sua empresa</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 p-6 space-y-8">
            <section>
              <h3 className="font-bold flex items-center gap-2 mb-4"><Briefcase className="h-4 w-4 text-primary" /> Resumo do Negócio</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Atividade</span>
                  {extractedData?.business_type}
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Localização</span>
                  {extractedData?.city}
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Faturamento</span>
                  {brl(extractedData?.revenue)}/mês
                </div>
                <div className="bg-muted/50 p-3 rounded-md">
                  <span className="block text-[10px] text-muted-foreground uppercase font-bold">Equipe</span>
                  {extractedData?.employees || 0} funcionários
                </div>
              </div>
            </section>

            <section className="border-t pt-6">
              <h3 className="font-bold flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4 text-primary" /> Próximos Passos</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</div>
                  <span>Viabilidade do endereço na prefeitura de {extractedData?.city?.split('/')[0]}.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</div>
                  <span>Definição dos CNAEs (atividades) para garantir a menor carga tributária possível.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</div>
                  <span>Elaboração do Contrato Social e registro na Junta Comercial.</span>
                </li>
              </ul>
              <p className="mt-4 text-[11px] text-muted-foreground bg-muted/30 p-2 rounded italic">
                Nota: O regime tributário e estrutura societária serão validados pela nossa equipe técnica.
              </p>
            </section>
          </Card>

          <Card className="p-6 bg-primary text-primary-foreground flex flex-col">
            <h3 className="font-bold text-lg mb-2">Plano Recomendado</h3>
            {plan ? (
              <>
                <div className="text-3xl font-bold mb-1">{plan.nome}</div>
                <div className="text-sm opacity-90 mb-6">{brl(plan.valor_padrao)}/mês</div>
                <div className="flex-1 space-y-3">
                  <p className="text-xs font-medium">Por que este plano?</p>
                  <p className="text-xs opacity-80 leading-relaxed">
                    Com base no faturamento de {brl(extractedData?.revenue)}, este plano oferece a cobertura necessária para sua conformidade contábil e fiscal.
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
                <Button variant="secondary" className="w-full mt-6 text-primary font-bold" onClick={() => setStep('checkout')}>Iniciar Abertura</Button>
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
          flowType="opening"
          initialPlanId={plan?.id}
          extractedData={extractedData}
          contactData={getContactData()}
          onBack={() => setStep('diagnostic')}
          onConfirm={() => {
            toast.success("Contratação realizada com sucesso! Nossa equipe entrará em contato.");
            onBack();
          }}
        />
      </div>
    );
  }

  const getContactData = () => {
    return {
      name: extractedData?.name || contact.email.split('@')[0] || "Interessado",
      email: contact.email || extractedData?.email || "",
      phone: contact.phone || extractedData?.phone || ""
    };
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col h-[700px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold">Abrir minha empresa</h2>
          <p className="text-sm text-muted-foreground">Conte-nos sobre seu projeto</p>
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
               Processando seu negócio...
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
          placeholder="Ex: Quero abrir uma hamburgueria..."
          disabled={loading}
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      
      <p className="mt-4 text-[10px] text-center text-muted-foreground">
        Ao continuar, você concorda com nossos termos de uso e política de privacidade.
      </p>
    </div>
  );
}
