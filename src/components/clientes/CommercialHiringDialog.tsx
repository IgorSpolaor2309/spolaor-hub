import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { calculateCommercialTotal, CommercialItem } from "@/lib/commercial-calculations";
import { brl } from "@/lib/services-catalog";
import { Ticket } from "lucide-react";

export function CommercialHiringDialog({ clientId, current, onDone }: { clientId: string; current: any; onDone: () => void }) {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string | null>(current?.plan_id || null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Queries
  const { data: plans = [] } = useQuery({
    queryKey: ["plans-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("plans").select("id, nome, valor_padrao").eq("status", "ativo");
      if (error) throw error;
      return data || [];
    }
  });

  const { data: allServices = [] } = useQuery({
    queryKey: ["services-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("services").select("id, nome, valor_referencia, categoria").eq("status", "ativo");
      if (error) throw error;
      return data || [];
    }
  });

  // Carregar serviços extras já vinculados (se houver)
  useQuery({
    queryKey: ["client-contract-services", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("client_contract_services").select("service_id").eq("client_id", clientId);
      if (data) setSelectedServices(data.map((d: any) => d.service_id));
      return data;
    }
  });

  // Mapping for calculations
  const basePlan = useMemo(() => {
    const p = (plans as any[]).find(p => p.id === planId);
    if (!p) return null;
    return { id: p.id, name: p.nome, value: p.valor_padrao || 0, type: 'plan' as const } as CommercialItem;
  }, [plans, planId]);

  const extraServices = useMemo(() => {
    return (allServices as any[])
      .filter(s => selectedServices.includes(s.id))
      .map(s => ({ id: s.id, name: s.nome, value: s.valor_referencia || 0, type: 'service' as const } as CommercialItem));
  }, [allServices, selectedServices]);

  const totals = useMemo(() => calculateCommercialTotal(basePlan, extraServices, appliedCoupon), [basePlan, extraServices, appliedCoupon]);

  const validateCoupon = async () => {
    if (!couponCode) return;
    setIsValidatingCoupon(true);
    try {
      const { data, error } = await (supabase as any).rpc("validate_coupon", { p_code: couponCode, p_client_id: clientId });
      if (error) throw error;
      if (!data.valid) {
        toast.error(data.message);
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data);
        toast.success("Cupom aplicado!");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      // 1. Atualizar client_commercial principal
      const commercialPayload = {
        plan_id: planId,
        original_value: totals.originalValue,
        discount_value: totals.discountValue,
        final_value: totals.finalValue,
        valor_mensalidade: totals.finalValue,
        updated_at: new Date().toISOString()
      };
      
      const { error: commErr } = await (supabase as any)
        .from("client_commercial")
        .update(commercialPayload)
        .eq("client_id", clientId);
      if (commErr) throw commErr;

      // 2. Atualizar serviços extras (delete e insert simplificado para sync)
      await (supabase as any).from("client_contract_services").delete().eq("client_id", clientId);
      if (selectedServices.length > 0) {
        const servicesPayload = selectedServices.map(sid => ({
          client_id: clientId,
          service_id: sid,
          valor_acordado: (allServices as any[]).find(s => s.id === sid)?.valor_referencia || 0
        }));
        const { error: servErr } = await (supabase as any).from("client_contract_services").insert(servicesPayload);
        if (servErr) throw servErr;
      }

      // 3. Registrar uso de cupom se novo
      if (appliedCoupon && appliedCoupon.coupon_id) {
         await (supabase as any).from("client_contract_coupons").upsert({
           client_id: clientId,
           coupon_id: appliedCoupon.coupon_id
         });
      }
    },
    onSuccess: () => {
      toast.success("Contratação comercial atualizada!");
      onDone();
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Montar Contratação Comercial</DialogTitle></DialogHeader>
      
      <div className="space-y-6 py-4">
        {/* Plano Base */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">1. Escolha o Plano Base</Label>
          <div className="grid grid-cols-2 gap-2">
            {(plans as any[]).map(p => (
              <div 
                key={p.id} 
                onClick={() => setPlanId(p.id)}
                className={`cursor-pointer rounded-lg border p-3 transition-all ${planId === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'}`}
              >
                <div className="font-medium">{p.nome}</div>
                <div className="text-sm text-muted-foreground">{brl(p.valor_padrao)}/mês</div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Serviços Extras */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">2. Serviços Extraordinários Incluídos</Label>
          <div className="grid gap-2 border rounded-md p-2 max-h-48 overflow-y-auto bg-muted/20">
            {(allServices as any[]).map(s => (
              <label key={s.id} className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer">
                <Checkbox 
                  checked={selectedServices.includes(s.id)}
                  onCheckedChange={(checked) => {
                    if (checked) setSelectedServices([...selectedServices, s.id]);
                    else setSelectedServices(selectedServices.filter(id => id !== s.id));
                  }}
                />
                <div className="flex-1 text-sm">
                  <span className="font-medium">{s.nome}</span>
                  <span className="text-muted-foreground ml-2 text-xs">({s.categoria})</span>
                </div>
                <div className="text-sm font-mono">{brl(s.valor_referencia)}</div>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Cupom */}
        <div className="space-y-2">
          <Label className="text-base font-semibold">3. Aplicar Cupom de Desconto</Label>
          <div className="flex gap-2">
            <Input 
              placeholder="Ex: BEMVINDO20" 
              value={couponCode} 
              onChange={e => setCouponCode(e.target.value.toUpperCase())}
              disabled={!!appliedCoupon}
            />
            {appliedCoupon ? (
              <Button variant="outline" onClick={() => { setAppliedCoupon(null); setCouponCode(""); }}>Remover</Button>
            ) : (
              <Button onClick={validateCoupon} disabled={!couponCode || isValidatingCoupon}>
                {isValidatingCoupon ? "Validando..." : "Aplicar"}
              </Button>
            )}
          </div>
          {appliedCoupon && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
              <Ticket className="h-4 w-4" />
              Cupom aplicado com sucesso!
            </div>
          )}
        </div>

        {/* Resumo Financeiro */}
        <div className="rounded-xl bg-primary/5 p-4 border border-primary/10">
          <h3 className="text-sm font-bold uppercase mb-3 text-primary/70">Resumo da Contratação</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Preço de tabela (Original)</span>
              <span>{brl(totals.originalValue)}</span>
            </div>
            {totals.discountValue > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Desconto aplicado</span>
                <span>- {brl(totals.discountValue)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-lg font-bold">
              <span>VALOR FINAL</span>
              <span className="text-primary">{brl(totals.finalValue)}/mês</span>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button 
          className="w-full sm:w-auto"
          disabled={!planId || save.isPending} 
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Confirmando Contratação..." : "Confirmar e Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
