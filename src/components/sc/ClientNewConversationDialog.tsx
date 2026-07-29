import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquarePlus, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Abertura de conversa pelo perfil CLIENTE.
 *
 * Modelo atual das Interações: UMA conversa por empresa (índice único em
 * chat_conversations.client_id). Portanto não há campo "assunto": o botão
 * localiza a conversa existente da empresa ou cria a primeira, sempre com a
 * mensagem inicial — nunca uma conversa vazia.
 *
 * Toda a escrita passa pela RPC transacional public.client_open_interaction,
 * que valida auth.uid(), papel client e vínculo com a empresa. A UI nunca
 * insere direto em chat_conversations / chat_messages.
 */
export function ClientNewConversationDialog({
  existingByClientId,
  onOpened,
}: {
  /** client_id -> conversation_id das conversas já visíveis ao cliente. */
  existingByClientId: Record<string, string>;
  onOpened: (conversationId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Empresas vinculadas — a RLS de clients já restringe às empresas da conta.
  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ["client-chat-companies"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, razao_social, nome_fantasia")
        .is("deleted_at", null)
        .neq("status", "inactive")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Uma única empresa vinculada: seleção automática, sem abrir o Select.
  useEffect(() => {
    if (open && !clientId && companies.length === 1) setClientId(companies[0].id);
  }, [open, clientId, companies]);

  const alreadyHasConversation = !!(clientId && existingByClientId[clientId]);
  const canSubmit = !!clientId && (!!body.trim() || !!file);

  const openInteraction = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("Selecione a empresa");
      let attachmentPath: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        // O prefixo é validado no backend: só a pasta da própria empresa.
        const path = `${clientId}/chat/nova/${Date.now()}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (upErr) throw upErr;
        attachmentPath = path;
      }
      const { data, error } = await supabase.rpc("client_open_interaction", {
        _client_id: clientId,
        _body: body.trim() || undefined,
        _attachment_path: attachmentPath ?? undefined,
        _attachment_name: file?.name ?? undefined,
        _attachment_size: file?.size ?? undefined,
      });
      if (error) throw error;
      return data as unknown as { conversation_id: string };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["chat-convs"] });
      qc.invalidateQueries({ queryKey: ["chat-msgs", res.conversation_id] });
      setOpen(false);
      setBody("");
      setFile(null);
      onOpened(res.conversation_id);
      toast.success("Conversa aberta. A equipe foi avisada.");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Não foi possível abrir a conversa";
      toast.error(
        /não vinculada|42501|row-level|permission/i.test(msg)
          ? "Você não tem acesso a esta empresa."
          : /mensagem ou anexe/i.test(msg)
            ? "Escreva uma mensagem ou anexe um arquivo."
            : msg,
      );
    },
  });

  const empresaLabel = useMemo(() => {
    const c = companies.find((x) => x.id === clientId);
    return c?.nome_fantasia || c?.razao_social || "";
  }, [companies, clientId]);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <MessageSquarePlus className="mr-2 h-4 w-4" /> Nova conversa
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!openInteraction.isPending) setOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{alreadyHasConversation ? "Enviar mensagem" : "Nova conversa"}</DialogTitle>
            <DialogDescription>
              {alreadyHasConversation
                ? `Já existe uma conversa com a contabilidade para ${empresaLabel}. Sua mensagem será enviada nela.`
                : "Escolha a empresa e escreva sua primeira mensagem para a contabilidade."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {companies.length > 1 && (
              <div>
                <Label className="text-xs">Empresa</Label>
                <Select value={clientId} onValueChange={setClientId} disabled={openInteraction.isPending}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {companies.length === 1 && (
              <p className="text-xs text-muted-foreground">Empresa: <span className="font-medium">{empresaLabel}</span></p>
            )}
            {!loadingCompanies && companies.length === 0 && (
              <p className="text-sm text-destructive">Nenhuma empresa vinculada à sua conta.</p>
            )}

            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                rows={4}
                placeholder="Como podemos ajudar?"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={openInteraction.isPending}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={openInteraction.isPending}
              >
                <Paperclip className="mr-2 h-4 w-4" /> Anexar arquivo
              </Button>
              {file && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate max-w-[12rem]">{file.name}</span>
                  <button type="button" onClick={() => setFile(null)} aria-label="Remover anexo">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={openInteraction.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={() => openInteraction.mutate()}
                disabled={!canSubmit || openInteraction.isPending}
              >
                {openInteraction.isPending
                  ? "Enviando…"
                  : alreadyHasConversation ? "Abrir conversa" : "Iniciar conversa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
