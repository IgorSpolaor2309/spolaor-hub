import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContractForReview } from "@/lib/contracts-management.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, CheckCircle, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/revisar-contrato/$contractId")({
  component: ReviewContractPage,
});

function ReviewContractPage() {
  const { contractId } = Route.useParams();
  const navigate = useNavigate();

  console.log(`[REVIEW_ROUTE_ID] Current ID: ${contractId}`);

  const fetchContract = useServerFn(getContractForReview);

  const { data: contract, isLoading, error } = useQuery({
    queryKey: ["generated-contract-public", contractId],
    queryFn: async () => {
      console.log(`[CONTRACT_FETCH_START] ID: ${contractId}`);
      const result = await fetchContract({ data: { contractId } });
      console.log(`[CONTRACT_FETCH_RESULT] Found: ${!!result}, ID: ${result?.id}, Snapshot length: ${result?.content_snapshot?.length}`);
      return result;
    },
    retry: false,
    enabled: !!contractId,
  });

  const brl = (n: number | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground animate-pulse">Carregando seu contrato...</p>
        </div>
      </div>
    );
  }

  if (error || !contract) {
    const errorMsg = (error as any)?.message;
    let title = "Contrato não encontrado";
    let description = "Não conseguimos localizar o contrato solicitado. O link pode ter expirado ou estar incorreto.";

    if (errorMsg === "missing_snapshot" || (contract && !contract.content_snapshot)) {
      title = "Contrato sem conteúdo";
      description = "O conteúdo do contrato não foi processado ou está vazio. Por favor, retorne e tente gerar novamente.";
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md p-8 text-center space-y-6 border-destructive/20 shadow-xl">
          <div className="h-16 w-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-display">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
            <p className="text-[10px] text-muted-foreground mt-4 font-mono">ID: {contractId}</p>
          </div>
          <Button asChild className="w-full">
            <Link to="/">Voltar ao início</Link>
          </Button>
        </Card>
      </div>
    );
  }

  console.log(`[RENDER_CONTRACT] Rendering contract ${contract.id} with snapshot of ${contract.content_snapshot?.length} chars`);

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="container max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              Etapa 2 de 3: Revisão
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold font-display tracking-tight text-foreground">
              Revise seu contrato
            </h1>
            <p className="text-muted-foreground text-lg">
              Leia atentamente os termos antes de prosseguir para a assinatura digital.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => window.history.back()} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar e corrigir
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Contract Content */}
          <Card className="lg:col-span-2 p-0 overflow-hidden border-none shadow-2xl bg-white min-h-[800px] flex flex-col">
            <div className="p-8 md:p-12 prose prose-slate max-w-none flex-1 overflow-y-auto min-h-[600px]">
              {/* Contrato Formatado */}
              {contract.content_snapshot ? (
                <div 
                  className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-slate-800"
                  dangerouslySetInnerHTML={{ __html: String(contract.content_snapshot).replace(/\n/g, '<br />') }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
                  <FileText className="h-12 w-12 mb-4 opacity-20" />
                  <p>O conteúdo do contrato não está disponível.</p>
                  <p className="text-xs">ID: {contract.id}</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-500 text-xs">
              <FileText className="h-3 w-3" />
              <span>Snapshot gerado em {new Date(contract.created_at || new Date().toISOString()).toLocaleString('pt-BR')} • Versão {contract.version}</span>
            </div>
          </Card>

          {/* Sidebar Summary */}
          <div className="space-y-6">
            <Card className="p-6 border-primary/10 shadow-lg sticky top-8 bg-background">
              <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Resumo Comercial
              </h3>
              
              <div className="space-y-4 text-sm">
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div>
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Empresa / Contratante</span>
                    <span className="font-medium text-foreground">{contract.prospect?.contact_name || (contract as any).placeholders?.razao_social}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{contract.prospect?.cnpj}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Plano Selecionado</span>
                    <span className="font-bold text-primary">{contract.prospect?.plan?.nome || 'Personalizado'}</span>
                  </div>
                  <div className="pt-3 border-t border-muted-foreground/10">
                    <span className="block text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Valor da Mensalidade</span>
                    <span className="text-xl font-bold text-foreground">{brl(contract.prospect?.final_value)}</span>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  {(contract as any).validation_errors?.length > 0 && (
                    <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-destructive font-bold text-xs uppercase">
                        <AlertTriangle className="h-4 w-4" />
                        Pendências no Contrato
                      </div>
                      <ul className="text-[10px] text-destructive/80 list-disc list-inside">
                        {(contract as any).validation_errors.map((err: string) => (
                          <li key={err}>{err.replace(/_/g, ' ')} ausente</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button 
                    className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20" 
                    disabled={!!((contract as any).validation_errors?.length > 0)}
                    onClick={() => {
                      toast.info("Em breve: Integração com assinatura digital (Docusign/Clicksign)");
                    }}
                  >
                    {(contract as any).validation_errors?.length > 0 ? "Corrija as pendências" : "Continuar para assinatura"}
                  </Button>
                  
                  <p className="text-[10px] text-center text-muted-foreground px-2 leading-relaxed">
                    Ao clicar em continuar, você será redirecionado para o ambiente de assinatura digital segura.
                  </p>
                </div>
              </div>
            </Card>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex gap-3 text-amber-800 shadow-sm">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide">Atenção</p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  Os dados do contrato foram extraídos do seu preenchimento inicial. Caso note algum erro, volte e corrija antes de assinar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
