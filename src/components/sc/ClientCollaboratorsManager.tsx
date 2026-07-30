import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Star } from "lucide-react";
import { toast } from "sonner";
import {
  PRIMARY_HINT, carteiraAlert, linkErrorMessage,
  type CollaboratorOption,
} from "@/lib/client-collaborators";

/**
 * Fase E1.2C — gerenciamento da carteira da empresa (colaboradores
 * encarregados + responsável principal). Toda gravação passa pela RPC
 * transacional `admin_sync_client_collaborators`; a interface nunca faz
 * insert/delete direto em `client_collaborators`.
 */
export function ClientCollaboratorsManager({
  clientId,
  asCard = true,
  onChange,
}: {
  clientId: string;
  asCard?: boolean;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const [toAdd, setToAdd] = useState("");
  const [removing, setRemoving] = useState<CollaboratorOption | null>(null);
  const [substitute, setSubstitute] = useState("");

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["client-collab-options", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_client_collaborator_options", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return (data ?? []) as CollaboratorOption[];
    },
  });

  const linked = useMemo(() => options.filter((o) => o.linked), [options]);
  const available = useMemo(() => options.filter((o) => !o.linked), [options]);
  const primary = linked.find((o) => o.is_primary) ?? null;
  const alert = carteiraAlert({
    linkedCount: linked.length,
    hasEligiblePrimary: !!primary && primary.eligible_primary,
  });

  const sync = useMutation({
    mutationFn: async (input: { ids: string[]; primaryId: string | null }) => {
      const { error } = await supabase.rpc("admin_sync_client_collaborators", {
        p_client_id: clientId,
        p_collaborator_ids: input.ids,
        p_primary_collaborator_id: input.primaryId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-collab-options", clientId] });
      qc.invalidateQueries({ queryKey: ["client-collabs", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-list"] });
      onChange?.();
      toast.success("Carteira atualizada.");
    },
    onError: (e) => toast.error(linkErrorMessage(e)),
  });

  const ids = linked.map((o) => o.collaborator_id);

  function handleAdd() {
    if (!toAdd) return;
    const next = [...ids, toAdd];
    const added = options.find((o) => o.collaborator_id === toAdd);
    // Sem principal ainda e o novo é elegível: o servidor define automaticamente.
    const primaryId = primary?.collaborator_id ?? (added?.eligible_primary ? toAdd : null);
    sync.mutate({ ids: next, primaryId });
    setToAdd("");
  }

  function confirmRemove() {
    if (!removing) return;
    const next = ids.filter((i) => i !== removing.collaborator_id);
    const wasPrimary = removing.is_primary;
    const primaryId = wasPrimary ? (substitute || null) : (primary?.collaborator_id ?? null);
    sync.mutate({ ids: next, primaryId });
    setRemoving(null);
    setSubstitute("");
  }

  const removingEligibleRest = removing
    ? linked.filter((o) => o.collaborator_id !== removing.collaborator_id && o.eligible_primary)
    : [];
  const needsSubstitute = !!removing && removing.is_primary && removingEligibleRest.length > 1;

  const body = (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Colaboradores encarregados</h3>
        <p className="text-xs text-muted-foreground">
          O responsável principal recebe as competências e atribuições gerais desta empresa.
        </p>
      </div>

      {alert && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {alert.kind === "sem_vinculo"
              ? "Empresa sem colaborador encarregado. Vincule ao menos um colaborador da equipe."
              : "Empresa sem responsável principal elegível. Defina um colaborador ativo com conta de acesso da equipe."}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <Label className="text-xs">Vincular colaborador</Label>
          <Select value={toAdd} onValueChange={setToAdd}>
            <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <SelectItem value="__none" disabled>Nenhum colaborador disponível</SelectItem>
              ) : available.map((o) => (
                <SelectItem key={o.collaborator_id} value={o.collaborator_id}>
                  {o.nome}{o.email ? ` · ${o.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAdd} disabled={!toAdd || sync.isPending}>Vincular</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : linked.length === 0 ? (
        <EmptyState title="Nenhum colaborador vinculado" />
      ) : (
        <ul className="divide-y">
          {linked.map((c) => (
            <li key={c.collaborator_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{c.nome}</span>
                  {c.is_primary && (
                    <Badge className="gap-1"><Star className="h-3 w-3" />Responsável principal</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.email ?? "—"}
                  {c.is_primary ? ` · ${PRIMARY_HINT}` : ""}
                  {!c.eligible_primary && c.ineligible_reason ? ` · ${c.ineligible_reason}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!c.is_primary && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!c.eligible_primary || sync.isPending}
                    title={c.eligible_primary ? undefined : (c.ineligible_reason ?? undefined)}
                    onClick={() => sync.mutate({ ids, primaryId: c.collaborator_id })}
                  >
                    Tornar principal
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sync.isPending}
                  onClick={() => { setRemoving(c); setSubstitute(""); }}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => { if (!o) { setRemoving(null); setSubstitute(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover colaborador da empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.nome ?? "Este colaborador"} deixará de acessar esta empresa
              (documentos, solicitações, pendências, guias, histórico e mensagens) e não
              receberá mais notificações relacionadas a ela.
              {removing?.is_primary && removingEligibleRest.length === 0
                ? " Ele é o responsável principal e a empresa ficará sem responsável — vincule outro colaborador antes."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsSubstitute && (
            <div>
              <Label className="text-xs">Novo responsável principal</Label>
              <Select value={substitute} onValueChange={setSubstitute}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {removingEligibleRest.map((o) => (
                    <SelectItem key={o.collaborator_id} value={o.collaborator_id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={needsSubstitute && !substitute}
              onClick={(e) => {
                if (needsSubstitute && !substitute) { e.preventDefault(); return; }
                confirmRemove();
              }}
            >
              Remover colaborador
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return asCard ? <Card className="p-4">{body}</Card> : body;
}
