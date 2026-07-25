import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/sc/EmptyState";
import { Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { PROCESS_STATUS, getProcessStatusLabel } from "@/lib/processos-constants";
import { ProcessListItem } from "@/components/sc/ProcessListItem";

export const Route = createFileRoute("/_authenticated/portal-processos")({
  component: ClientProcessosPage,
  errorComponent: () => (
    <EmptyState icon={<Workflow className="h-6 w-6" />} title="Não foi possível carregar os processos" description="Tente novamente em instantes." />
  ),
});

function ClientProcessosPage() {
  const [q, setQ] = useState("");
  const [fEmp, setFEmp] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fAcao, setFAcao] = useState<string>("all");
  const [ord, setOrd] = useState<string>("recente");

  const listQ = useQuery({
    queryKey: ["client-processes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("client_list_processes");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const empresas = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of listQ.data ?? []) map.set(p.client_id, p.empresa);
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [listQ.data]);

  const filtered = useMemo(() => {
    let items = (listQ.data ?? []).filter((p: any) =>
      (fEmp === "all" || p.client_id === fEmp) &&
      (fStatus === "all" || p.status === fStatus) &&
      (fAcao === "all" || (fAcao === "sim" && p.aguardando_minha_acao) || (fAcao === "nao" && !p.aguardando_minha_acao)) &&
      (!q.trim() || `${p.tipo_nome ?? ""} ${p.empresa ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    );
    if (ord === "recente") items = [...items].sort((a: any, b: any) => (a.data_abertura < b.data_abertura ? 1 : -1));
    else if (ord === "progresso") items = [...items].sort((a: any, b: any) => (progresso(b) - progresso(a)));
    else if (ord === "prazo") items = [...items].sort((a: any, b: any) => (a.prazo_final ?? "9999") > (b.prazo_final ?? "9999") ? 1 : -1);
    return items;
  }, [listQ.data, q, fEmp, fStatus, fAcao, ord]);

  return (
    <div>
      <PageHeader title="Processos" description="Acompanhe seus processos e ações pendentes." />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <Input placeholder="Buscar por tipo ou empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fEmp} onValueChange={setFEmp}>
            <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas empresas</SelectItem>
              {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.keys(PROCESS_STATUS).map((k) => (
                <SelectItem key={k} value={k}>{getProcessStatusLabel(k, "client")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fAcao} onValueChange={setFAcao}>
            <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sim">Aguardando minha ação</SelectItem>
              <SelectItem value="nao">Sem pendência minha</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ord} onValueChange={setOrd}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recente">Mais recentes</SelectItem>
              <SelectItem value="progresso">Maior progresso</SelectItem>
              <SelectItem value="prazo">Prazo mais próximo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {listQ.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Card key={i} className="h-24 animate-pulse p-4" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Workflow className="h-6 w-6" />} title="Nenhum processo encontrado" description="Quando a contabilidade abrir um processo relacionado à sua empresa, ele aparecerá aqui." />
      ) : (
        <div className="grid gap-3">
          {filtered.map((p: any) => (
            <ProcessListItem
              key={p.id}
              audience="client"
              processId={p.id}
              empresa={p.empresa}
              tipoNome={p.tipo_nome}
              status={p.status}
              prazoFinal={p.prazo_final}
              dataAbertura={p.data_abertura}
              totalEtapas={Number(p.progresso_total ?? 0)}
              etapasConcluidas={Number(p.progresso_concluido ?? 0)}
              aguardandoAcao={!!p.aguardando_minha_acao}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function progresso(p: any) {
  const total = Number(p.progresso_total ?? 0);
  const done = Number(p.progresso_concluido ?? 0);
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
