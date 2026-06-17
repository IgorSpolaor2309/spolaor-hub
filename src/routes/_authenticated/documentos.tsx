import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { DeleteButton } from "@/components/sc/DeleteButton";
import { useState } from "react";
import { DOC_TYPES, DOC_STATUSES, labelOf } from "@/lib/sc-types";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";


export const Route = createFileRoute("/_authenticated/documentos")({
  component: DocsPage,
});

function DocsPage() {
  const { role } = useCurrentUser();
  const qc = useQueryClient();
  const isAdmin = role === "admin";
  const [q, setQ] = useState(""); const [tipo, setTipo] = useState("all"); const [status, setStatus] = useState("all");
  const { data: list = [], isLoading } = useQuery({
    queryKey: ["all-docs"],
    queryFn: async () => (await supabase.from("documents").select("*, clients(razao_social)").order("created_at", { ascending: false })).data ?? [],
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-docs"] }); toast.success("Documento excluído"); },
    onError: (e: any) => toast.error(/row-level security|permission/i.test(e?.message ?? "") ? "Sem permissão para excluir." : (e.message ?? "Falha")),
  });
  const filtered = list.filter((d: any) => {
    if (tipo !== "all" && d.tipo !== tipo) return false;
    if (status !== "all" && d.status !== status) return false;
    if (q && !`${d.nome} ${d.clients?.razao_social ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="Documentos" description="Central de documentos de todos os clientes." />
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos status</SelectItem>{DOC_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> :
         filtered.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Sem documentos" /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b"><th className="py-2 pr-4">Arquivo</th><th>Cliente</th><th>Tipo</th><th>Competência</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => (
                <tr key={d.id} className="border-b">
                  <td className="py-3 pr-4 font-medium">{d.nome}</td>
                  <td><Link to="/clientes/$id" params={{ id: d.client_id }} className="text-secondary hover:underline">{d.clients?.razao_social}</Link></td>
                  <td>{labelOf(DOC_TYPES, d.tipo)}</td>
                  <td>{d.competencia ?? "—"}</td>
                  <td><StatusBadge value={d.status} /></td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <AttachmentButton storagePath={d.storage_path} label="Abrir" />
                      {isAdmin && <DeleteButton onConfirm={() => remove.mutate(d.id)} iconOnly />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

