import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Info, Minus, Plus, Tag, ArrowRight, Loader2, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { calculateCommercialTotal, type CommercialItem, type CouponData } from "@/lib/commercial-calculations";
import { useQuery } from "@tanstack/react-query";
import { getPublicPlans, getPublicServices } from "@/lib/public-catalog.functions";
import { validateCoupon, confirmContracting } from "@/lib/commercial.functions";
import { safeTrackLead as trackJourney } from "@/lib/leads-client";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { MissingFieldsModal } from "./MissingFieldsModal";
import { generateContract } from "@/lib/contracts-management.functions";


interface CheckoutViewProps {
  flowType: "opening" | "switching";
  initialPlanId?: string;
  leadId?: string;
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
  leadId,
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
  const [missingFieldsModal, setMissingFieldsModal] = useState<{
    isOpen: boolean;
    missingFields: string[];
    prospectId: string;
    extractedData: any;
  }>({
    isOpen: false,
    missingFields: [],
    prospectId: "",
    extractedData: null,
  });

  const navigate = useNavigate();

  const validateCouponFn = useServerFn(validateCoupon);
  const confirmContractingFn = useServerFn(confirmContracting);
  const generateContractFn = useServerFn(generateContract);


  const { data: plans = [] } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
  });

  const { data: services = [] } = useQuery({
    queryKey: ["public-services"],
    queryFn: () => getPublicServices(),
  });

  const activePlan = useMemo(() => {
    return plans.find(p => p.id === selectedPlanId);
  }, [plans, selectedPlanId]);

  const includedServiceIds = useMemo(() => {
    return new Set(activePlan?.plan_services?.map((ps: any) => ps.service_id) || []);
  }, [activePlan]);

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
        type: 'service' as const,
        isIncluded: includedServiceIds.has(s.id)
      }));
  }, [services, selectedExtraIds, includedServiceIds]);

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
        if (leadId) {
          trackJourney({
            data: {
              leadId,
              journeyStep: 'cupom_aplicado'
            }
          }).catch(console.error);
        }
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
      // 1. Confirmar intenção (cria/atualiza prospect e lead)
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
      
      console.log(`[CHECKOUT_CONFIRMED] Prospect: ${result.prospectId}`);
      
      // 2. Tentar gerar o contrato
      await processContractGeneration(result.prospectId, result.leadId || leadId);

    } catch (e: any) {
      console.error("[CONTRACT_GENERATION_ERROR]", e);
      toast.error(e.message || "Erro ao registrar intenção de contratação");
    } finally {
      setIsConfirming(false);
    }
  };

  const processContractGeneration = async (prospectId: string, leadIdParam?: string) => {
    try {
      console.log(`[CONTRACT_GENERATION_START] Prospect: ${prospectId}`);
      
      console.log(`[generateContract_CALL] prospectId: ${prospectId}`);
      const result = await generateContractFn({
        data: { prospectId }
      });

      console.log("[generateContract_RESULT]", result);

      const contractId = result.contractId || result.id;
      console.log("[contractId_FOUND]", contractId);


      console.log(`[VALIDATION_RESULT] Errors: ${result.missingFields?.length || 0}`);
      
      // 3. Se houver campos obrigatórios faltando, exibimos o modal para que o usuário complete.
      // O contrato JÁ FOI gerado, mas para seguir para a revisão idealmente os dados devem estar lá.
      if (result.missingFields && result.missingFields.length > 0) {
        console.log(`[VALIDATION_ERRORS] Fields missing:`, result.missingFields);
        setMissingFieldsModal({
          isOpen: true,
          missingFields: result.missingFields,
          prospectId: prospectId,
          extractedData: extractedData
        });
        return;
      }



      // 4. Se não houver erros, validar se tem ID e Snapshot
      if (!contractId) {
        console.error("[CONTRACT_GENERATION_ERROR] Missing ID", result);
        toast.error("Contrato gerado, mas não foi possível abrir a revisão.");
        return;
      }

      if (!result.content_snapshot || result.content_snapshot.length === 0) {
        console.error("[CONTRACT_GENERATION_ERROR] Missing or empty Snapshot", result);
        toast.error("Contrato gerado sem conteúdo. Por favor, tente novamente.");
        return;
      }

      console.log(`[CONTRACT_GENERATION_SUCCESS] ID: ${contractId}, Snapshot length: ${result.content_snapshot.length}`);
      
      // 5. Rastrear jornada final
      await trackJourney({
        data: {
          leadId: leadIdParam || leadId,
          journeyStep: 'contratacao_confirmada',
          estimatedValue: totals.finalValue,
          lastInteraction: `Contrato gerado (${contractId}) para o plano ${selectedPlan?.name}. Redirecionando para revisão.`
        }
      });

      console.log(`[NAVIGATING_TO_REVIEW] ID: ${contractId}`);
      toast.success("Contrato gerado com sucesso! Redirecionando para revisão.");
      
      // Forçar navegação imediata
      window.location.href = `/revisar-contrato/${contractId}`;
      
      console.log("NAVIGATION_CALLED");
    } catch (e: any) {
      console.error("[CONTRACT_GENERATION_ERROR]", e);
      toast.error(e.message || "Erro ao gerar contrato");
      throw e;
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
            {services
              .filter(s => s.status === 'active' && ['Legalização', 'Administrativo', 'Certificados Digitais'].includes(s.categoria))
              .map((s) => {
                const isIncluded = includedServiceIds.has(s.id);
                const isSelected = selectedExtraIds.includes(s.id);
                
                return (
                  <div 
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all",
                      isSelected ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-card hover:bg-muted/30 border-muted',
                      isIncluded && isSelected && 'opacity-80 grayscale-[0.5]'
                    )}
                  >
                    <div className="flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{s.nome}</span>
                        {s.descricao && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[200px] text-xs">
                                {s.descricao}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn(
                          "text-xs font-bold",
                          isIncluded && isSelected ? "text-muted-foreground line-through" : "text-primary"
                        )}>
                          {brl(s.valor_referencia || 0)}
                        </span>
                        {isIncluded && isSelected && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-green-100 text-green-700 hover:bg-green-100 border-none">
                            Incluído no plano
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button 
                      size="icon" 
                      variant={isSelected ? "default" : "outline"}
                      className="h-8 w-8 shrink-0"
                      onClick={() => toggleExtra(s.id)}
                    >
                      {isSelected ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
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
                <span className="text-muted-foreground flex items-center gap-1.5">
                  {s.name}
                  {s.isIncluded && <Badge variant="secondary" className="text-[8px] h-3 px-1 leading-none uppercase">Incluído</Badge>}
                </span>
                <span className={cn("font-medium", s.isIncluded && "line-through text-muted-foreground")}>
                  {brl(s.value)}
                </span>
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
                  Revisar contrato
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

      <MissingFieldsModal
        isOpen={missingFieldsModal.isOpen}
        onClose={() => setMissingFieldsModal(prev => ({ ...prev, isOpen: false }))}
        leadId={missingFieldsModal.prospectId}
        initialData={missingFieldsModal.extractedData}
        missingFields={missingFieldsModal.missingFields}
        onSuccess={() => {
          // Re-trigger generation after data update
          processContractGeneration(missingFieldsModal.prospectId);
        }}
      />
    </div>

  );
}