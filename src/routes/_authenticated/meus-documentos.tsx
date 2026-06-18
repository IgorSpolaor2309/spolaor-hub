import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/sc/StatusBadge";
import { EmptyState } from "@/components/sc/EmptyState";
import { FileText, Upload } from "lucide-react";
import { DOC_TYPES, labelOf } from "@/lib/sc-types";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meus-documentos")({
  component: MyDocsPage,
});

function MyDocsPage() {
  const { userId, loading } = useCurrentUser();
  const [tipo, setTipo] = useState("outro");
  const [competencia, setCompetencia] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: clients = [], error: clientsError } = useQuery({
    queryKey: ["my-clients-docs", userId],
    enabled: !loading && !!userId,
    retry: 1,
    // RLS multiempresa: cliente vê todas as empresas vinculadas.
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia, documento")
        .is("deleted_at", null)
        .neq("status", "inactive")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: docs = [], refetch, isLoading, error: docsError } = useQuery({
    queryKey: ["my-docs", clients.map((c) => c.id).join(",")],
    enabled: clients.length > 0,
    retry: 1,
    queryFn: async () => {
      const ids = clients.map((c) => c.id);
      const { data, error } = await supabase
        .from("documents")
        .select("*, clients(razao_social, nome_fantasia)")
        .in("client_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [clientId, setClientId] = useState<string>("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const cid = clientId || clients[0]?.id;
    if (!file || !cid) { toast.error("Selecione cliente e arquivo"); return; }
    setUploading(true);
    try {
      const path = `${cid}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("documents").insert({
        client_id: cid, nome: file.name, tipo, competencia: competencia || null,
        storage_path: path, uploaded_by: userId, status: "recebido",
      });
      if (error) throw error;
      toast.success("Documento enviado");
      refetch();
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); e.target.value = ""; }
  }

  return (
    <div>
      <PageHeader title="Meus documentos" description="Envie e acompanhe seus documentos." />
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
          {clients.length > 1 && (
            <div><Label className="text-xs">Empresa</Label>
              <Select value={clientId || clients[0]?.id} onValueChange={setClientId}>
                <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                <SelectContent>{clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_fantasia || c.razao_social}{c.documento ? ` · ${c.documento}` : ""}
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Competência</Label><Input className="w-[140px]" placeholder="2026-06" value={competencia} onChange={(e) => setCompetencia(e.target.value)} /></div>
          <label className="ml-auto">
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading || clients.length === 0} />
            <Button asChild disabled={uploading || clients.length === 0}><span><Upload className="mr-2 h-4 w-4" />{uploading ? "Enviando…" : "Enviar"}</span></Button>
          </label>
        </div>
        {clientsError || docsError ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Não foi possível carregar os dados" description="Tente novamente em instantes." />
        : loading || isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : docs.length === 0 ? <EmptyState icon={<FileText className="h-6 w-6" />} title="Nenhum documento enviado" /> : (
          <ul className="divide-y">
            {docs.map((d: any) => (
              <li key={d.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{d.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {labelOf(DOC_TYPES, d.tipo)} {d.competencia ? `· ${d.competencia}` : ""}
                    {clients.length > 1 && (d.clients?.nome_fantasia || d.clients?.razao_social) && (
                      <> · Empresa: {d.clients?.nome_fantasia || d.clients?.razao_social}</>
                    )}
                  </div>
                </div>
                <StatusBadge value={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
