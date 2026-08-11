import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { History, Plus, Briefcase, Calendar } from "lucide-react";
import { clientLabel } from "@/lib/client-display";
import { assignPlan, isValidCompetence } from "@/lib/client-plans";
import { currentCompetencia, formatCompetenciaLong } from "@/lib/competencia";

export function ClientPlansVigencySection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [assigningClient, setAssigningClient] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ["client-plan-history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_plan_history")
        .select("*, clients(razao_social, nome_fantasia, documento), plans(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientsQ = useQuery({
    queryKey: ["clients-for-plans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const plansQ = useQuery({
    queryKey: ["plans-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("id, nome")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-plan-history"] });
    qc.invalidateQueries({ queryKey: ["plans"] }); // For plan_items count etc
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">Vínculos de Empresas e Planos</h3>
        </div>
        {isAdmin && (
          <Dialog open={!!assigningClient} onOpenChange={(v) => !v && setAssigningClient(null)}>
            <DialogTrigger asChild>
              <Button onClick={() => setAssigningClient("new")}>
                <Plus className="mr-2 h-4 w-4" /> Vincular Empresa
              </Button>
            </DialogTrigger>
            {assigningClient && (
              <AssignPlanDialog
                clients={clientsQ.data ?? []}
                plans={plansQ.data ?? []}
                onDone={() => {
                  setAssigningClient(null);
                  invalidate();
                }}
              />
            )}
          </Dialog>
        )}
      </div>

      {historyQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico…</p>
      ) : (historyQ.data ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma empresa vinculada a planos ainda.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(historyQ.data ?? []).map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {clientLabel(row.clients)}
                  </TableCell>
                  <TableCell>{row.plans?.nome}</TableCell>
                  <TableCell>{formatCompetenciaLong(row.competencia_inicio)}</TableCell>
                  <TableCell>
                    {row.competencia_fim ? formatCompetenciaLong(row.competencia_fim) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === "ativo" ? "default" : "secondary"}>
                      {row.status === "ativo" ? "Vigente" : "Encerrado"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AssignPlanDialog({
  clients,
  plans,
  onDone,
}: {
  clients: any[];
  plans: any[];
  onDone: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [comp, setComp] = useState(currentCompetencia());

  const mutation = useMutation({
    mutationFn: async () => {
      if (!clientId || !planId || !isValidCompetence(comp)) {
        throw new Error("Preencha todos os campos corretamente.");
      }
      return assignPlan(clientId, planId, comp);
    },
    onSuccess: () => {
      toast.success("Plano vinculado com sucesso!");
      onDone();
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao vincular plano"),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Vincular Plano à Empresa</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        <div className="space-y-2">
          <Label>Empresa</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a empresa" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {clientLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Plano</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o plano" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Competência de Início</Label>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              value={comp}
              onChange={(e) => setComp(e.target.value)}
              placeholder="AAAA-MM"
              className="max-w-[120px]"
            />
            <span className="text-xs text-muted-foreground">
              {isValidCompetence(comp) ? formatCompetenciaLong(comp) : "Inválida"}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            A vigência anterior (se houver) será encerrada no mês anterior a este.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !clientId || !planId || !isValidCompetence(comp)}
        >
          {mutation.isPending ? "Processando…" : "Confirmar Vínculo"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
