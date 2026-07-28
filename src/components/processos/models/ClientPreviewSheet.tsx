import { Eye, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export function ClientPreviewSheet({ open, onOpenChange, step, requirements }: {
  open: boolean; onOpenChange: (v: boolean) => void; step: any; requirements: any[];
}) {
  const nome = step.nome_publico?.trim() || step.nome;
  const desc = step.descricao_publica?.trim() || step.descricao;
  const obs = step.observacao_publica?.trim();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Visualização como cliente
          </SheetTitle>
          <SheetDescription>Prévia de como esta etapa aparecerá no Portal.</SheetDescription>
        </SheetHeader>
        {!step.visivel_cliente && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            <AlertCircle className="mr-1 inline h-3 w-3" />
            Esta etapa está marcada como <b>Interna</b>. O cliente não vai enxergá-la enquanto o interruptor "Mostrar" estiver desligado.
          </div>
        )}
        <div className="mt-4 rounded border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Etapa {step.ordem}</span>
            <span className="text-sm font-medium">{nome}</span>
            <Badge className="bg-zinc-100 text-zinc-700">Pendente</Badge>
          </div>
          {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
          {obs && <p className="mt-1 text-xs italic text-muted-foreground">{obs}</p>}
          {requirements.filter((r) => r.visivel_cliente).length > 0 && (
            <ul className="mt-2 space-y-1">
              {requirements.filter((r) => r.visivel_cliente).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span className={r.obrigatorio ? "font-medium" : ""}>{r.nome_publico?.trim() || r.nome}</span>
                  {r.obrigatorio && <Badge variant="secondary" className="text-[10px]">Obrigatório</Badge>}
                  {(r.descricao_publica?.trim() || r.descricao) && (
                    <span className="w-full text-[11px] text-muted-foreground">{r.descricao_publica?.trim() || r.descricao}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {requirements.filter((r) => r.visivel_cliente).length === 0 && requirements.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">Nenhum requisito visível ao cliente nesta etapa.</p>
          )}
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground">
          <CheckCircle2 className="mr-1 inline h-3 w-3" /> Simulação — dados reais dependem do processo em andamento.
        </div>
      </SheetContent>
    </Sheet>
  );
}
