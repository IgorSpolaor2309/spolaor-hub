import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, ArrowRight, PartyPopper } from "lucide-react";

interface SuccessScreenProps {
  prospectId: string;
  planName: string;
  onDone: () => void;
}

export function SuccessScreen({ prospectId, planName, onDone }: SuccessScreenProps) {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center animate-in zoom-in duration-500">
      <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mb-8">
        <PartyPopper className="h-10 w-10 text-green-600" />
      </div>
      
      <h1 className="font-display text-3xl font-bold mb-4 text-foreground">
        Contratação recebida com sucesso!
      </h1>
      
      <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
        Seja bem-vindo à <strong>Digital SC</strong>. Recebemos sua solicitação para o <strong>{planName}</strong> e nossa equipe técnica já está preparando os próximos passos do seu onboarding.
      </p>

      <Card className="p-6 mb-10 border-green-100 bg-green-50/30 text-left">
        <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground mb-4">Próximos Passos</h3>
        <ul className="space-y-4">
          <li className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-green-200 text-green-700 text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</div>
            <p className="text-sm">Um consultor Digital SC entrará em contato via WhatsApp/E-mail em até 24h úteis.</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-green-200 text-green-700 text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</div>
            <p className="text-sm">Realizaremos a conferência técnica dos CNAEs e regime tributário.</p>
          </li>
          <li className="flex items-start gap-3">
            <div className="h-5 w-5 rounded-full bg-green-200 text-green-700 text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</div>
            <p className="text-sm">Enviaremos o link para assinatura digital do contrato e liberação do portal.</p>
          </li>
        </ul>
      </Card>

      <div className="bg-muted/50 rounded-lg p-4 mb-10 text-xs text-muted-foreground flex items-center justify-center gap-2">
        <span>Protocolo de contratação:</span>
        <code className="bg-background px-2 py-0.5 rounded border font-mono text-[10px]">{prospectId.split('-')[0].toUpperCase()}</code>
      </div>

      <Button size="lg" className="w-full sm:w-auto px-12" onClick={onDone}>
        Voltar para a Home
      </Button>
    </div>
  );
}
