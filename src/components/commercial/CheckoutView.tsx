import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Info, Minus, Plus, Tag, ArrowRight, Loader2 } from "lucide-react";
import { calculateCommercialTotal, type CommercialItem, type CouponData } from "@/lib/commercial-calculations";
import { useQuery } from "@tanstack/react-query";
import { getPublicPlans, getPublicServices } from "@/lib/public-catalog.functions";
import { validateCoupon, confirmContracting } from "@/lib/commercial.functions";
import { trackLeadJourney } from "@/lib/leads.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

interface CheckoutViewProps {
  flowType: "opening" | "switching";
  initialPlanId?: string;
  prospectId?: string;
  extractedData: any;
  contactData: {
    name: string;
    email: string;
    phone: string;
  };
  onBack: () => void;
  onConfirm: (prospectId: string) => void;
}

export function CheckoutView({ 
  flowType, 
  initialPlanId, 
  prospectId,
  extractedData, 
  contactData,
  onBack, 
  onConfirm 
}: CheckoutViewProps) {
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId);
  const [selectedExtraIds, setSelectedExtraIds] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponData | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const validateCouponFn = useServerFn(validateCoupon);
  const confirmContractingFn = useServerFn(confirmContracting);
  const trackJourney = useServerFn(trackLeadJourney);

  const { data: plans = [] } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["public-services"],
    queryFn: () => getPublicServices(),
  });

  const selectedPlan = useMemo(() => {
    const plan = plans.find(p => p.id === selectedPlanId);
    if (!plan) return null;
    return {
      id: plan.id,
      name: plan.nome,
      value: plan.valor_padrao,
      type: 'plan' as const
    };
  }, [plans, selectedPlanId]);

  const extraServices = useMemo(() => {
    return services
      .filter(s => selectedExtraIds.includes(s.id))
      .map(s => ({
        id: s.id,
        name: s.nome,
        value: s.valor_referencia || 0,
        type: 'service' as const
      }));
  }, [services, selectedExtraIds]);

  const totals = useMemo(() => {
    return calculateCommercialTotal(selectedPlan, extraServices, appliedCoupon);
  }, [selectedPlan, extraServices, appliedCoupon]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsValidatingCoupon(true);
    try {
      const result = await validateCouponFn({ data: { code: couponCode } });
      if (result.valid && result.coupon) {
        setAppliedCoupon(result.coupon as any);
        trackJourney({
          data: {
            prospectId: initialPlanId, // Aqui precisamos passar o prospectId, mas CheckoutView recebe prospectId via prop ou extraímos?
            // CheckoutView atual não recebe prospectId. Vou ajustar a prop.
            journeyStep: 'cupom_aplicado'
          }
        }).catch(console.error);
        toast.success("Cupom aplicado com sucesso!");
      } else {
        toast.error(result.message || "Cupom inválido");
      }
    } catch (e) {
      toast.error("Erro ao validar cupom");
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const result = await confirmContractingFn({
        data: {
          flow_type: flowType,
          extracted_data: extractedData,
          plan_id: selectedPlanId!,
          extra_service_ids: selectedExtraIds,
          coupon_id: appliedCoupon?.id,
          contact_data: contactData,
          totals
        }
      });
      
      trackJourney({
        data: {
          prospectId: result.prospectId,
          journeyStep: 'intencao_contratar',
          estimatedValue: totals.finalValue
        }
      }).catch(console.error);

      onConfirm(result.prospectId);
    } catch (e) {
      toast.error("Erro ao registrar intenção de contratação");
    } finally {
      setIsConfirming(false);
    }
  };

  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const toggleExtra = (id: string) => {
    setSelectedExtraIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 grid md:grid-cols-3 gap-8 animate-in fade-in duration-500">
      <div className="md:col-span-2 space-y-8">
        {/* Plan Selection */}
        <section>
          <h2 className="text-xl font-display font-bold mb-4">1. Revise seu plano</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {plans.map((p) => (
              <Card 
                key={p.id}
                className={`p-4 cursor-pointer transition-all border-2 ${selectedPlanId === p.id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                onClick={() => setSelectedPlanId(p.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold">{p.nome}</span>
                  {selectedPlanId === p.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div className="text-lg font-bold text-primary">{brl(p.valor_padrao)}<span className="text-[10px] text-muted-foreground font-normal">/mês</span></div>
                <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">{p.descricao}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Extra Services */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">2. Adicione serviços extras</h2>
            <span className="text-[10px] text-muted-foreground uppercase font-bold bg-muted px-2 py-0.5 rounded">Opcional</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {services.filter(s => s.status === 'active').map((s) => (
              <div 
                key={s.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${selectedExtraIds.includes(s.id) ? 'bg-primary/5 border-primary/20' : 'bg-card hover:bg-muted/50'}`}
              >
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.nome}</div>
                  <div className="text-xs text-primary font-bold">{brl(s.valor_referencia || 0)}</div>
                </div>
                <Button 
                  size="icon" 
                  variant={selectedExtraIds.includes(s.id) ? "default" : "outline"}
                  className="h-8 w-8"
                  onClick={() => toggleExtra(s.id)}
                >
                  {selectedExtraIds.includes(s.id) ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Coupon */}
        <section>
          <h2 className="text-xl font-display font-bold mb-4">3. Cupom de desconto</h2>
          <div className="flex gap-2 max-w-sm">
            <div className="relative flex-1">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Digite seu cupom" 
                className="pl-9"
                value={couponCode}
                onChange={e => setCouponCode(e.target.value.toUpperCase())}
              />
            </div>
            <Button 
              variant="outline" 
              onClick={handleApplyCoupon}
              disabled={isValidatingCoupon || !couponCode.trim()}
            >
              {isValidatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar"}
            </Button>
          </div>
          {appliedCoupon && (
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
              <Check className="h-3 w-3" /> Cupom <strong>{appliedCoupon.code}</strong> aplicado com sucesso!
            </p>
          )}
        </section>
      </div>

      {/* Summary Sidebar */}
      <div className="space-y-6">
        <Card className="p-6 sticky top-8 shadow-lg border-primary/10">
          <h3 className="font-display text-lg font-bold mb-6">Resumo da Proposta</h3>
          
          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{selectedPlan?.name || "Nenhum plano"}</span>
              <span className="font-medium">{brl(selectedPlan?.value ?? 0)}</span>
            </div>
            
            {extraServices.map(s => (
              <div key={s.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-medium">{brl(s.value)}</span>
              </div>
            ))}

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{brl(totals.originalValue)}</span>
              </div>
              
              {totals.discountValue > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Desconto {appliedCoupon?.code ? `(${appliedCoupon.code})` : ''}</span>
                  <span>-{brl(totals.discountValue)}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold pt-2 border-t text-primary">
                <span>Total mensal</span>
                <span>{brl(totals.finalValue)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-muted/50 p-3 rounded text-[10px] text-muted-foreground flex gap-2">
              <Info className="h-3 w-3 shrink-0" />
              <p>O valor acima refere-se à mensalidade recorrente da Digital SC. Taxas de abertura ou migração serão cobradas separadamente conforme diagnóstico.</p>
            </div>

            <Button 
              className="w-full h-12 text-lg font-bold" 
              onClick={handleConfirm}
              disabled={!selectedPlanId || isConfirming}
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  Quero contratar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
            
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={onBack}>
              Voltar e revisar dados
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}