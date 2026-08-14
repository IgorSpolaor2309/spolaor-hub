import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Save, Plus, Trash2, CheckCircle2, XCircle, Send, Copy, 
  Calculator, FileText, AlertTriangle 
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPublicPlans, getPublicServices } from "@/lib/public-catalog.functions";
import { saveProposal, updateProposalStatus, duplicateProposal } from "@/lib/proposals.functions";

interface ProposalConfiguratorProps {
  lead: any;
  proposal: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  collaborators: any[];
}

export function ProposalConfigurator({ lead, proposal, isOpen, onOpenChange, collaborators }: ProposalConfiguratorProps) {
  const queryClient = useQueryClient();
  const saveProposalFn = useServerFn(saveProposal);
  const updateStatusFn = useServerFn(updateProposalStatus);
  const duplicateFn = useServerFn(duplicateProposal);

  const [formData, setFormData] = useState<any>(proposal || {
    lead_id: lead.id,
    monthly_value: 0,
    setup_value: 0,
    discount_value: 0,
    final_monthly_value: 0,
    services: [],
    status: 'rascunho'
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => getPublicPlans(),
  });

  const { data: catalogServices = [] } = useQuery({
    queryKey: ["public-services"],
    queryFn: () => getPublicServices(),
  });

  const isAccepted = formData.status === 'aceita';

  const totals = useMemo(() => {
    const monthly = Number(formData.monthly_value || 0);
    const discount = Number(formData.discount_value || 0);
    const extras = formData.services
      ?.filter((s: any) => !s.included)
      ?.reduce((acc: number, s: any) => acc + Number(s.value || 0), 0) || 0;
    
    return {
      monthly,
      extras,
      discount,
      final: Math.max(0, monthly + extras - discount)
    };
  }, [formData.monthly_value, formData.discount_value, formData.services]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => saveProposalFn({ data: { ...data, final_monthly_value: totals.final } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setFormData(data);
      toast.success("Proposta salva com sucesso");
    },
    onError: (err: any) => toast.error(`Erro ao salvar: ${err.message}`)
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => updateStatusFn({ data: { id: formData.id, status: newStatus as any } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success("Status atualizado");
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`)
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateFn({ data: { id: formData.id } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setFormData(data);
      toast.success("Rascunho duplicado");
    }
  });

  const addService = (serviceId: string) => {
    const service = catalogServices.find(s => s.id === serviceId);
    if (!service) return;
    
    const newService = {
      service_id: service.id,
      name: service.nome,
      value: service.valor_referencia || 0,
      included: true,
      notes: "",
      limit: ""
    };

    setFormData((prev: any) => ({
      ...prev,
      services: [...(prev.services || []), newService]
    }));
  };

  const removeService = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      services: prev.services.filter((_: any, i: number) => i !== index)
    }));
  };

  const updateService = (index: number, field: string, value: any) => {
    setFormData((prev: any) => {
      const newServices = [...prev.services];
      newServices[index] = { ...newServices[index], [field]: value };
      return { ...prev, services: newServices };
    });
  };

  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Configurador de Proposta: {lead.name}
              </DialogTitle>
              <DialogDescription>
                {formData.id ? `Editando proposta de ${format(new Date(formData.created_at), "dd/MM/yyyy")}` : "Criando nova proposta personalizada"}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isAccepted ? "default" : "outline"} className={isAccepted ? "bg-green-600" : ""}>
                {formData.status.toUpperCase()}
              </Badge>
              {isAccepted && (
                <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate()}>
                  <Copy className="h-4 w-4 mr-2" /> Novo Rascunho
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-8 pb-10">
              {isAccepted && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-bold">Proposta Aceita e Bloqueada</p>
                    <p>Esta proposta já foi aceita e vinculada ao funil de contratação. As condições estão congeladas para segurança contratual.</p>
                  </div>
                </div>
              )}

              <section className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Calculator className="h-4 w-4" /> Plano Base e Valores
                </h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Plano Base (Referência)</label>
                    <Select 
                      disabled={isAccepted}
                      value={formData.base_plan_id || undefined}
                      onValueChange={(val) => {
                        const plan = plans.find(p => p.id === val);
                        setFormData((prev: any) => ({ 
                          ...prev, 
                          base_plan_id: val,
                          monthly_value: plan?.valor_padrao || prev.monthly_value 
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome} ({brl(p.valor_padrao)})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Mensalidade Base</label>
                    <Input 
                      type="number"
                      disabled={isAccepted}
                      value={formData.monthly_value}
                      onChange={e => setFormData((prev: any) => ({ ...prev, monthly_value: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Valor Implantação</label>
                    <Input 
                      type="number"
                      disabled={isAccepted}
                      value={formData.setup_value}
                      onChange={e => setFormData((prev: any) => ({ ...prev, setup_value: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Desconto Mensal</label>
                    <Input 
                      type="number"
                      disabled={isAccepted}
                      value={formData.discount_value}
                      onChange={e => setFormData((prev: any) => ({ ...prev, discount_value: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                   Escopo do Atendimento
                </h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Faturamento Máx.</label>
                    <Input 
                      type="number"
                      disabled={isAccepted}
                      value={formData.max_revenue || ""}
                      onChange={e => setFormData((prev: any) => ({ ...prev, max_revenue: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Qtd. Empresas</label>
                    <Input 
                      type="number"
                      disabled={isAccepted}
                      value={formData.company_count}
                      onChange={e => setFormData((prev: any) => ({ ...prev, company_count: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Qtd. Funcionários</label>
                    <Input 
                      type="number"
                      disabled={isAccepted}
                      value={formData.employee_count}
                      onChange={e => setFormData((prev: any) => ({ ...prev, employee_count: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Validade</label>
                    <Input 
                      type="date"
                      disabled={isAccepted}
                      value={formData.valid_until ? formData.valid_until.split('T')[0] : ""}
                      onChange={e => setFormData((prev: any) => ({ ...prev, valid_until: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    Composição de Serviços
                  </h4>
                  {!isAccepted && (
                    <Select onValueChange={addService}>
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <Plus className="h-3 w-3 mr-2" /> Adicionar Serviço
                      </SelectTrigger>
                      <SelectContent>
                        {catalogServices.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                
                <div className="space-y-3">
                  {formData.services?.map((s: any, idx: number) => (
                    <Card key={idx} className="p-4 bg-muted/30">
                      <div className="grid grid-cols-12 gap-4 items-start">
                        <div className="col-span-4">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Serviço</label>
                          <div className="text-sm font-medium">{s.name}</div>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Tipo</label>
                          <Select 
                            disabled={isAccepted}
                            value={s.included ? "included" : "extra"}
                            onValueChange={(val) => updateService(idx, 'included', val === 'included')}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="included">Incluso</SelectItem>
                              <SelectItem value="extra">Extra</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Valor (se extra)</label>
                          <Input 
                            type="number"
                            className="h-8 text-xs"
                            disabled={isAccepted || s.included}
                            value={s.value}
                            onChange={e => updateService(idx, 'value', e.target.value)}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] uppercase font-bold text-muted-foreground">Notas/Limites</label>
                          <Input 
                            placeholder="Ex: Até 50 lançamentos"
                            className="h-8 text-xs"
                            disabled={isAccepted}
                            value={s.limit || ""}
                            onChange={e => updateService(idx, 'limit', e.target.value)}
                          />
                        </div>
                        <div className="col-span-1 flex justify-end pt-5">
                          {!isAccepted && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeService(idx)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(!formData.services || formData.services.length === 0) && (
                    <div className="text-center py-10 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
                      Nenhum serviço adicionado. Use o botão acima para compor a proposta.
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Observações Comerciais</label>
                    <Textarea 
                      disabled={isAccepted}
                      placeholder="Informações relevantes para o fechamento..."
                      className="min-h-[100px] text-sm"
                      value={formData.commercial_notes || ""}
                      onChange={e => setFormData((prev: any) => ({ ...prev, commercial_notes: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Condições Especiais</label>
                    <Textarea 
                      disabled={isAccepted}
                      placeholder="Prazos, carências, etc..."
                      className="min-h-[100px] text-sm"
                      value={formData.special_conditions || ""}
                      onChange={e => setFormData((prev: any) => ({ ...prev, special_conditions: e.target.value }))}
                    />
                  </div>
                </div>
              </section>
            </div>
          </ScrollArea>

          <div className="w-[300px] border-l bg-slate-50/30 p-6 flex flex-col">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6">Resumo Financeiro</h4>
            
            <div className="space-y-4 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mensalidade Base</span>
                <span>{brl(totals.monthly)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Serviços Extras</span>
                <span>{brl(totals.extras)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Desconto Comercial</span>
                  <span>-{brl(totals.discount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-end">
                <span className="text-sm font-bold">Total Mensal</span>
                <span className="text-xl font-bold text-primary">{brl(totals.final)}</span>
              </div>

              {Number(formData.setup_value || 0) > 0 && (
                <div className="mt-4 pt-4 border-t border-dashed">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Implantação (Única)</span>
                    <span className="font-bold">{brl(Number(formData.setup_value))}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-6">
              {!isAccepted && (
                <>
                  <Button 
                    className="w-full gap-2" 
                    onClick={() => saveMutation.mutate(formData)}
                    disabled={saveMutation.isPending}
                  >
                    <Save className="h-4 w-4" /> Salvar Rascunho
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    onClick={() => statusMutation.mutate('enviada')}
                    disabled={!formData.id}
                  >
                    <Send className="h-4 w-4" /> Marcar como Enviada
                  </Button>
                  <Button 
                    variant="default" 
                    className="w-full gap-2 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      if (window.confirm("Isso irá congelar a proposta e criar o registro de contratação. Continuar?")) {
                        statusMutation.mutate('aceita');
                      }
                    }}
                    disabled={!formData.id}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Aprovar Proposta
                  </Button>
                </>
              )}
              {isAccepted && (
                <Button 
                  variant="outline" 
                  className="w-full gap-2 text-red-600"
                  onClick={() => statusMutation.mutate('cancelada')}
                >
                  <XCircle className="h-4 w-4" /> Cancelar Proposta
                </Button>
              )}
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
