import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, ClipboardList, Info, Send, Sparkles } from "lucide-react";
import type { NeedToRequestDiagnostic } from "@/lib/documentos/workspace-types";
import type { EligibleChecklistItem } from "@/lib/documentos/create-request-types";
import { DocumentWorkspacePagination } from "./DocumentWorkspacePagination";
import { CreateRequestDialog } from "./CreateRequestDialog";
import { formatBR } from "@/lib/dates";

type Props = {
  data: NeedToRequestDiagnostic | undefined;
  loading: boolean;
  error: Error | null;
  onGoToChecklist: () => void;
  items: EligibleChecklistItem[];
  itemsTotal: number;
  itemsLoading: boolean;
  itemsError: Error | null;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
};

/**
 * Aba "Precisa solicitar" — diagnóstico + lista acionável.
 * A criação acontece aqui mesmo, vinculada ao item de checklist.
 */
export function NeedToRequestPanel({
  data, loading, error, onGoToChecklist,
  items, itemsTotal, itemsLoading, itemsError, page, pageSize, onPage, onPageSize,
}: Props) {
  const [selected, setSelected] = useState<EligibleChecklistItem | null>(null);
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <Card className="p-6 space-y-3">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-6 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Não foi possível carregar o diagnóstico.</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </Card>
    );
  }

  const elegiveis = data?.elegiveis ?? 0;

  return (
    <div className="space-y-3">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <Sparkles className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium">Itens do checklist que precisam virar solicitação</h3>
            <p className="text-sm text-muted-foreground">
              Crie a solicitação aqui mesmo: o item de checklist é vinculado automaticamente
              e o cliente passa a ver o pedido no portal.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <Stat label="Elegíveis para solicitação" value={elegiveis} highlight />
              <Stat label="Já com solicitação ativa" value={data?.ja_com_request_ativo ?? 0} />
              <Stat label="Já com documento" value={data?.ja_com_documento ?? 0} />
            </div>

            {data?.criterio && (
              <p className="text-xs text-muted-foreground mt-3 inline-flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5" />
                <span>{data.criterio}</span>
              </p>
            )}

            <div className="mt-4">
              <Button variant="outline" onClick={onGoToChecklist} className="gap-2">
                <ClipboardList className="h-4 w-4" />
                Abrir Checklist
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {itemsError ? (
        <Card className="p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não foi possível carregar os itens elegíveis.</p>
            <p className="text-sm text-muted-foreground">{itemsError.message}</p>
          </div>
        </Card>
      ) : itemsLoading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-1/2 mb-2" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-6 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Nenhum item pendente de solicitação</p>
            <p className="text-sm text-muted-foreground">
              Todos os itens do checklist no recorte atual já têm solicitação ou documento.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Card key={it.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium truncate">{it.titulo}</span>
                  {it.categoria && <Badge variant="outline">{it.categoria}</Badge>}
                  {it.is_demo && <Badge variant="secondary">Demo</Badge>}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {it.empresa_nome ?? "—"}
                  {it.competencia ? ` · ${it.competencia}` : ""}
                  {it.prazo ? ` · prazo ${formatBR(it.prazo)}` : ""}
                  {it.responsavel_nome ? ` · ${it.responsavel_nome}` : ""}
                </p>
              </div>
              <Button
                className="gap-2 shrink-0"
                onClick={() => { setSelected(it); setOpen(true); }}
              >
                <Send className="h-4 w-4" />
                Criar solicitação
              </Button>
            </Card>
          ))}
          <div className="pt-2">
            <DocumentWorkspacePagination
              page={page}
              pageSize={pageSize}
              total={itemsTotal}
              onPage={onPage}
              onPageSize={onPageSize}
            />
          </div>
        </div>
      )}

      <CreateRequestDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setSelected(null); }}
        checklistItem={selected}
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${highlight ? "bg-primary/5 border-primary/20" : ""}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
