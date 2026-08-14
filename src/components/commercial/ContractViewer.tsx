import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, Download, Send, CheckCircle2, History, AlertTriangle, Printer, RotateCcw
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { generateContract, getGeneratedContracts } from "@/lib/contracts-management.functions";

interface ContractViewerProps {
  prospect: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContractViewer({ prospect, isOpen, onOpenChange }: ContractViewerProps) {
  const queryClient = useQueryClient();
  const generateFn = useServerFn(generateContract);
  const getContractsFn = useServerFn(getGeneratedContracts);

  const { data: contracts = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ["generated-contracts", prospect.id],
    queryFn: () => getContractsFn({ data: { prospectId: prospect.id } }),
    enabled: isOpen
  });

  const latestContract = contracts[0];
  const isSigned = latestContract?.status === 'contrato_assinado';
  const isSent = latestContract?.status === 'contrato_enviado';
  const isImmutable = isSigned || isSent;

  const generateMutation = useMutation({
    mutationFn: () => generateFn({ data: { prospectId: prospect.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["generated-contracts", prospect.id] });
      toast.success("Contrato gerado com sucesso");
    },
    onError: (err: any) => toast.error(`Erro ao gerar contrato: ${err.message}`)
  });

  const brl = (n: number | null) => 
    n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 border-b bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Contrato: {prospect.contact_name}
              </DialogTitle>
              <DialogDescription>
                Empresa: {prospect.contract_data?.razao_social || 'Não informada'} | CNPJ: {prospect.cnpj || 'Não informado'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {latestContract && (
                <Badge variant={isSigned ? "default" : "secondary"} className={isSigned ? "bg-green-600" : ""}>
                  {latestContract.status.toUpperCase().replace('_', ' ')}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Main Content: Preview */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-100 p-8">
            {latestContract ? (
              <Card className="flex-1 flex flex-col shadow-lg border-none overflow-hidden max-w-[210mm] mx-auto w-full bg-white p-[20mm] font-serif text-sm leading-relaxed whitespace-pre-wrap">
                <ScrollArea className="flex-1 pr-4">
                  <div className="contract-content">
                    {latestContract.content_snapshot}
                  </div>
                </ScrollArea>
              </Card>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4">
                <FileText className="h-16 w-16 opacity-10" />
                <div className="text-center">
                  <p className="font-medium">Nenhum contrato gerado para esta contratação.</p>
                  <p className="text-sm">Clique no botão "Gerar Contrato" para iniciar.</p>
                </div>
                <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Gerar Primeiro Contrato
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar: History & Actions */}
          <div className="w-80 border-l bg-white flex flex-col">
            <div className="p-4 border-b">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Versões
              </h4>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {contracts.map((c: any) => (
                  <div key={c.id} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold">v{c.version}</span>
                      <Badge variant="outline" className="text-[9px] h-4 uppercase">{c.status}</Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                    <div className="text-[10px] italic">Modelo: {c.model?.name}</div>
                  </div>
                ))}
                {contracts.length === 0 && !isLoadingHistory && (
                  <p className="text-xs text-muted-foreground text-center py-10">Nenhuma versão anterior.</p>
                )}
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-slate-50 space-y-3">
              {latestContract && !isImmutable && (
                <Button 
                  className="w-full gap-2" 
                  variant="outline"
                  onClick={() => {
                    if (window.confirm("Isso irá descartar a versão atual e gerar uma nova baseada no modelo ativo. Continuar?")) {
                      generateMutation.mutate();
                    }
                  }}
                  disabled={generateMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4" /> Regenerar Contrato
                </Button>
              )}
              
              {!latestContract && !generateMutation.isPending && (
                <Button className="w-full gap-2" onClick={() => generateMutation.mutate()}>
                  <CheckCircle2 className="h-4 w-4" /> Gerar Contrato
                </Button>
              )}

              {latestContract && (
                <>
                  <Button className="w-full gap-2" variant="default" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" /> Imprimir / PDF
                  </Button>
                  {latestContract.status === 'contrato_gerado' && (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-md flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-800">
                        Após marcar como <strong>Enviado</strong> ou <strong>Assinado</strong> na tela anterior, este documento ficará imutável.
                      </p>
                    </div>
                  )}
                </>
              )}

              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
