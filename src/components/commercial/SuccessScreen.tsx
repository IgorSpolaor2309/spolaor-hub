import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ArrowRight, ShieldCheck, Clock } from "lucide-react";

interface SuccessScreenProps {
  prospectId: string;
  planName: string;
  onDone: () => void;
}

export function SuccessScreen({ prospectId, planName, onDone }: SuccessScreenProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center animate-in zoom-in duration-500">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 mb-8">
        <ShieldCheck className="h-10 w-10 text-primary" />
      </div>
      
      <h1 className="font-display text-3xl font-bold mb-4 text-foreground">
        Proposta registrada com sucesso!
      </h1>
      
      <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
        Sua intenção de contratação para o plano <strong>{planName}</strong> foi recebida. 
        Este é o primeiro passo para nos tornarmos parceiros.
      </p>

      <Card className="p-6 mb-10 border-primary/10 bg-muted/30 text-left">
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">O que acontece agora?</h3>
        <ul className="space-y-4">
          <li className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</div>
            <p className="text-sm">Um consultor Digital SC analisará seu perfil e os dados fornecidos.</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</div>
            <p className="text-sm">Entraremos em contato via WhatsApp ou E-mail para validar detalhes técnicos.</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</div>
            <p className="text-sm">Após a validação, você receberá o <strong>Contrato de Prestação de Serviços</strong> para assinatura digital.</p>
          </li>
        </ul>
      </Card>

      <div className="bg-muted/50 rounded-lg p-4 mb-10 text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Clock className="h-3 w-3" />
        <span>Nossa equipe entrará em contato em breve.</span>
      </div>

      <Button size="lg" className="w-full sm:w-auto px-12" onClick={onDone}>
        Voltar para a Home
      </Button>
    </div>
  );
}
