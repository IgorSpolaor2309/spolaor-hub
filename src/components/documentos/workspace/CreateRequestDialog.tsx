import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  REQUEST_CATEGORIAS, REQUEST_DEPARTAMENTOS, REQUEST_TIPOS, REQUEST_URGENCIAS,
  type EligibleChecklistItem,
} from "@/lib/documentos/create-request-types";
import {
  useCreateDocumentRequest, useDuplicateCheck, useRequestResponsibles, useWorkspaceClients,
} from "@/hooks/documentos/use-create-document-request";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Quando presente, o formulário nasce pré-preenchido e vinculado ao item. */
  checklistItem?: EligibleChecklistItem | null;
  /** Empresa/competência padrão vindas dos filtros da Central. */
  defaultClientId?: string | null;
  defaultCompetencia?: string | null;
};

type Form = {
  client_id: string;
  titulo: string;
  descricao: string;
  competencia: string;
  categoria: string;
  tipo_solicitacao: string;
  departamento: string;
  prazo: string;
  urgencia: string;
  responsavel_profile_id: string;
  observacoes_internas: string;
};

const EMPTY_FORM: Form = {
  client_id: "", titulo: "", descricao: "", competencia: "", categoria: "",
  tipo_solicitacao: "", departamento: "", prazo: "", urgencia: "normal",
  responsavel_profile_id: "", observacoes_internas: "",
};

export function CreateRequestDialog({
  open, onOpenChange, checklistItem, defaultClientId, defaultCompetencia,
}: Props) {
  const [f, setF] = useState<Form>(EMPTY_FORM);
  const linked = !!checklistItem;

  const clientsQ = useWorkspaceClients(open && !linked);
  const clients = clientsQ.data ?? [];
  const respQ = useRequestResponsibles(f.client_id || null, open && !!f.client_id);
  const responsibles = respQ.data ?? [];
  const create = useCreateDocumentRequest();

  useEffect(() => {
    if (!open) return;
    if (checklistItem) {
      setF({
        ...EMPTY_FORM,
        client_id: checklistItem.client_id,
        titulo: checklistItem.titulo,
        competencia: checklistItem.competencia ?? "",
        categoria: checklistItem.categoria ?? "",
        prazo: checklistItem.prazo ?? "",
        responsavel_profile_id: checklistItem.responsavel_profile_id ?? "",
        descricao: checklistItem.observacao ?? "",
      });
    } else {
      setF({
        ...EMPTY_FORM,
        client_id: defaultClientId ?? "",
        competencia: defaultCompetencia ?? "",
      });
    }
  }, [open, checklistItem, defaultClientId, defaultCompetencia]);

  const dupQ = useDuplicateCheck(
    {
      clientId: f.client_id || null,
      competencia: f.competencia || null,
      categoria: f.categoria || null,
      tipo: f.tipo_solicitacao || null,
    },
    open,
  );
  const duplicates = dupQ.data ?? [];

  const canSave = useMemo(
    () => !!f.client_id && !!f.titulo.trim() && !create.isPending,
    [f.client_id, f.titulo, create.isPending],
  );

  const submit = async () => {
    if (!canSave) return;
    try {
      await create.mutateAsync({
        client_id: f.client_id,
        titulo: f.titulo.trim(),
        descricao: f.descricao || null,
        competencia: f.competencia || null,
        categoria: f.categoria || null,
        tipo_solicitacao: f.tipo_solicitacao || null,
        departamento: f.departamento || null,
        prazo: f.prazo || null,
        urgencia: f.urgencia || "normal",
        responsavel_profile_id: f.responsavel_profile_id || null,
        observacoes_internas: f.observacoes_internas || null,
        checklist_item_id: checklistItem?.id ?? null,
      });
      onOpenChange(false);
    } catch {
      /* erro já exibido via toast */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{linked ? "Solicitar documento do checklist" : "Nova solicitação"}</DialogTitle>
          <DialogDescription>
            A solicitação é criada com status <strong>Aguardando cliente</strong> e aparece imediatamente no portal.
          </DialogDescription>
        </DialogHeader>

        {linked && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{checklistItem?.empresa_nome ?? "Empresa"}</p>
            <p className="text-muted-foreground">
              Vinculado ao item de checklist “{checklistItem?.titulo}”
              {checklistItem?.competencia ? ` · ${checklistItem.competencia}` : ""}
            </p>
          </div>
        )}

        <div className="grid gap-3">
          {!linked && (
            <div className="space-y-1.5">
              <Label>Empresa *</Label>
              <Select value={f.client_id} onValueChange={(v) => setF({ ...f, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição para o cliente</Label>
            <Textarea rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={f.categoria} onValueChange={(v) => setF({ ...f, categoria: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {REQUEST_CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de solicitação</Label>
              <Select value={f.tipo_solicitacao} onValueChange={(v) => setF({ ...f, tipo_solicitacao: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {REQUEST_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Select value={f.departamento} onValueChange={(v) => setF({ ...f, departamento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {REQUEST_DEPARTAMENTOS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Urgência</Label>
              <Select value={f.urgencia} onValueChange={(v) => setF({ ...f, urgencia: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_URGENCIAS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Competência</Label>
              <Input placeholder="2026-06" value={f.competencia} onChange={(e) => setF({ ...f, competencia: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsável interno</Label>
            <Select
              value={f.responsavel_profile_id}
              onValueChange={(v) => setF({ ...f, responsavel_profile_id: v })}
              disabled={!f.client_id || respQ.isLoading}
            >
              <SelectTrigger><SelectValue placeholder={f.client_id ? "Selecione" : "Escolha a empresa primeiro"} /></SelectTrigger>
              <SelectContent>
                {responsibles.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Observações internas (não visíveis ao cliente)</Label>
            <Textarea rows={2} value={f.observacoes_internas} onChange={(e) => setF({ ...f, observacoes_internas: e.target.value })} />
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20 dark:border-amber-800">
              <p className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-100">
                <AlertTriangle className="h-4 w-4" /> Possível duplicidade
              </p>
              <ul className="mt-2 space-y-1 text-amber-900/90 dark:text-amber-100/90">
                {duplicates.map((d) => (
                  <li key={d.id} className="flex items-center gap-2">
                    <Badge variant="outline">{d.status}</Badge>
                    <span className="truncate">{d.titulo}</span>
                    {d.competencia && <span className="text-xs">· {d.competencia}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">Você ainda pode criar a solicitação se for realmente necessária.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSave}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
