import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/sc/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/sc/EmptyState";
import { AttachmentButton } from "@/components/sc/AttachmentButton";
import { MessageSquare, Paperclip, Send, Search, Wand2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ensureConversation } from "@/lib/chat";
import { applyTemplateVars, pendingVars, type TemplateVars } from "@/lib/template-vars";
import { TEMPLATE_CATEGORIES, labelOf } from "@/lib/sc-types";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";

const searchSchema = z.object({
  client: z.string().optional(),
  conversation: z.string().optional(),
});

function logChatError(action: string, error: unknown, extra?: Record<string, unknown>) {
  const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  console.error("[chat] Falha na operação", {
    action,
    code: err?.code,
    message: err?.message,
    details: err?.details,
    hint: err?.hint,
    ...extra,
  });
}

function ChatErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  // Evita escalar para o boundary do layout (que mostra "Página indisponível").
  // Renderiza um estado amigável e permite tentar novamente.
  useEffect(() => {
    logChatError("route.errorBoundary", error);
  }, [error]);

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader title="Interações" description="Chat interno com clientes da Spolaor Company." />
      <Card className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={<MessageSquare className="h-6 w-6" />}
          title="Não foi possível carregar o chat"
          description={error?.message?.includes("permission") || error?.message?.includes("row-level")
            ? "Você não tem acesso a esta conversa."
            : "Tente novamente em instantes. Se persistir, contate o administrador."}
        />
        <Button className="ml-4" variant="outline" onClick={() => reset()}>Tentar novamente</Button>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/interacoes")({
  validateSearch: zodValidator(searchSchema),
  component: ChatPage,
  errorComponent: ChatErrorBoundary,
});

type Conv = {
  id: string;
  client_id: string;
  last_message_at: string | null;
  clients?: { razao_social: string; nome_fantasia: string | null } | null;
};

type Msg = {
  id: string;
  conversation_id: string;
  client_id: string;
  sender_profile_id: string | null;
  sender_role: "admin" | "collaborator" | "client" | "system";
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  created_at: string;
};

function ChatPage() {
  const { role, userId, profile, loading } = useCurrentUser();
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/interacoes" });
  const navigate = useNavigate({ from: "/_authenticated/interacoes" });
  const isStaff = role === "admin" || role === "collaborator";
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(search.conversation ?? null);

  useEffect(() => {
    if (search.conversation) setActiveId(search.conversation);
  }, [search.conversation]);

  // Lista de conversas (RLS já filtra por permissão)
  const { data: conversations = [], isLoading: loadingConvs, error: convsError } = useQuery({
    queryKey: ["chat-convs", userId, role],
    enabled: !loading && !!userId && !!role,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_conversations")
        .select("id, client_id, last_message_at, clients(razao_social, nome_fantasia)")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) {
        logChatError("chat_conversations.select", error, { table: "chat_conversations" });
        throw error;
      }
      return (data ?? []) as Conv[];
    },
  });

  // Realtime: novas conversas
  useEffect(() => {
    if (loading || !userId) return;
    const ch = supabase
      .channel("chat-conversations")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "chat_conversations" },
        () => qc.invalidateQueries({ queryKey: ["chat-convs"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, loading, userId]);

  // Se veio ?client=ID, garante conversa
  useEffect(() => {
    if (!search.client || loading || !userId) return;
    (async () => {
      try {
        const id = await ensureConversation(search.client!);
        setActiveId(id);
        qc.invalidateQueries({ queryKey: ["chat-convs"] });
        navigate({ to: "/interacoes", search: { conversation: id }, replace: true });
      } catch (e: any) {
        toast.error(e?.message ?? "Não foi possível abrir a conversa");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.client, loading, userId]);

  // Auto-seleciona a primeira conversa. Para clientes sem conversa, cria uma
  // automaticamente para que a página não fique vazia/quebrada.
  useEffect(() => {
    if (loading || !userId || loadingConvs) return;
    if (activeId) return;
    if (conversations.length > 0) {
      setActiveId(conversations[0].id);
      return;
    }
    if (role === "client" && userId) {
      (async () => {
        try {
          // Multiempresa: pega a primeira empresa visível e cria a conversa dela.
          // Para as demais, a equipe inicia (ou o cliente abre via Minha área).
          const { data: cs } = await supabase
            .from("clients").select("id").is("deleted_at", null).neq("status", "inactive").limit(1);
          const clientId = cs?.[0]?.id;
          if (!clientId) return;
          const id = await ensureConversation(clientId);
          setActiveId(id);
          qc.invalidateQueries({ queryKey: ["chat-convs"] });
        } catch (e) {
          logChatError("clients.select/ensureConversation.autoCreate", e);
        }
      })();
    }
  }, [activeId, conversations, loadingConvs, role, userId, qc, loading]);

  const filteredConvs = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) =>
      `${c.clients?.razao_social ?? ""} ${c.clients?.nome_fantasia ?? ""}`.toLowerCase().includes(term),
    );
  }, [conversations, q]);

  const activeConv = conversations.find((c) => c.id === activeId);

  if (loading || !userId || !role) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="Interações"
        description="Chat interno com clientes da Spolaor Company."
        action={isStaff && <NewConversationButton />}
      />

      <Card className="flex flex-1 overflow-hidden p-0">
        {/* Lista de conversas */}
        <aside className="flex w-72 shrink-0 flex-col border-r">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convsError ? (
              <div className="p-4 text-xs text-destructive">Falha ao carregar conversas.</div>
            ) : loadingConvs ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
            ) : filteredConvs.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">Nenhuma conversa ainda.</div>
            ) : filteredConvs.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveId(c.id); navigate({ to: "/interacoes", search: { conversation: c.id }, replace: true }); }}
                className={cn(
                  "block w-full border-b px-3 py-3 text-left transition hover:bg-muted/50",
                  activeId === c.id && "bg-muted",
                )}
              >
                <div className="truncate text-sm font-medium">{c.clients?.nome_fantasia || c.clients?.razao_social || "Empresa"}</div>
                {c.clients?.nome_fantasia && c.clients?.razao_social && c.clients.nome_fantasia !== c.clients.razao_social && (
                  <div className="truncate text-[11px] text-muted-foreground">{c.clients.razao_social}</div>
                )}
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "Sem mensagens"}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Painel da conversa */}
        <section className="flex min-w-0 flex-1 flex-col">
          {activeConv ? (
            <ChatThread
              conv={activeConv}
              currentUserId={userId}
              currentRole={role as any}
              currentName={profile?.full_name ?? "Você"}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title="Selecione uma conversa"
                description={isStaff ? "Ou inicie uma nova com qualquer cliente." : "Aguarde sua equipe iniciar a conversa."}
              />
            </div>
          )}
        </section>
      </Card>
    </div>
  );
}

function ChatThread({
  conv, currentUserId, currentRole, currentName,
}: {
  conv: Conv;
  currentUserId: string | null;
  currentRole: "admin" | "collaborator" | "client" | null;
  currentName: string;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading: loadingMessages, error: messagesError } = useQuery({
    queryKey: ["chat-msgs", conv.id],
    enabled: !!conv.id && !!currentUserId && !!currentRole,
    retry: 1,
    queryFn: async () => {
      // Sem embed de profiles (RLS pode bloquear leitura cruzada e quebrar a query).
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });
      if (error) {
        logChatError("chat_messages.select", error, { table: "chat_messages", conversationId: conv.id });
        throw error;
      }
      return (data ?? []) as any[];
    },
  });

  // Realtime: novas mensagens da conversa atual
  useEffect(() => {
    const ch = supabase
      .channel(`chat-msgs-${conv.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conv.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat-msgs", conv.id] });
          qc.invalidateQueries({ queryKey: ["chat-convs"] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conv.id, qc]);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages.length]);

  const sendText = useMutation({
    mutationFn: async (body: string) => {
      if (!currentRole || !currentUserId) throw new Error("Não autenticado");
      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conv.id,
        client_id: conv.client_id,
        sender_profile_id: currentUserId,
        sender_role: currentRole,
        body,
      });
      if (error) {
        logChatError("chat_messages.insert.text", error, { table: "chat_messages", conversationId: conv.id, clientId: conv.client_id });
        throw error;
      }
    },
    onSuccess: () => { setText(""); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
  });

  const sendAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!currentRole || !currentUserId) throw new Error("Não autenticado");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${conv.client_id}/chat/${conv.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (upErr) {
        logChatError("storage.documents.upload.chatAttachment", upErr, { bucket: "documents", path });
        throw upErr;
      }
      const { error } = await supabase.from("chat_messages").insert({
        conversation_id: conv.id,
        client_id: conv.client_id,
        sender_profile_id: currentUserId,
        sender_role: currentRole,
        body: null,
        attachment_path: path,
        attachment_name: file.name,
        attachment_size: file.size,
      });
      if (error) {
        logChatError("chat_messages.insert.attachment", error, { table: "chat_messages", conversationId: conv.id, clientId: conv.client_id });
        throw error;
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao anexar"),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) sendAttachment.mutate(f);
    e.target.value = "";
  };

  // Variáveis disponíveis para o modelo
  const templateVars: TemplateVars = {
    nome_cliente: conv.clients?.razao_social,
    nome_empresa: conv.clients?.nome_fantasia ?? conv.clients?.razao_social,
    nome_colaborador: currentName,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Chat — Empresa</div>
          <div className="truncate font-medium">{conv.clients?.nome_fantasia || conv.clients?.razao_social || "Cliente"}</div>
          {conv.clients?.nome_fantasia && conv.clients?.razao_social && conv.clients.nome_fantasia !== conv.clients.razao_social && (
            <div className="truncate text-xs text-muted-foreground">{conv.clients.razao_social}</div>
          )}
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
        {messagesError ? (
          <div className="mt-12 text-center text-xs text-destructive">Falha ao carregar mensagens.</div>
        ) : loadingMessages ? (
          <div className="mt-12 text-center text-xs text-muted-foreground">Carregando mensagens…</div>
        ) : messages.length === 0 && (
          <div className="mt-12 text-center text-xs text-muted-foreground">
            Nenhuma mensagem ainda. Diga olá! 👋
          </div>
        )}
        {(messages as any[]).map((m: any) => {
          const mine = m.sender_profile_id === currentUserId;
          const fromStaff = m.sender_role === "admin" || m.sender_role === "collaborator";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  mine ? "bg-primary text-primary-foreground" : "bg-card border",
                )}
              >
                <div className={cn(
                  "mb-0.5 text-[10px] uppercase tracking-wide",
                  mine ? "text-primary-foreground/70" : "text-muted-foreground",
                )}>
                  {(fromStaff ? "Equipe" : "Cliente")} · {m.sender_role}
                </div>
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                {m.attachment_path && (
                  <div className={cn("mt-1", mine && "[&_button]:bg-primary-foreground [&_button]:text-primary")}>
                    <AttachmentButton storagePath={m.attachment_path} label={m.attachment_name ?? "Anexo"} />
                  </div>
                )}
                <div className={cn(
                  "mt-1 text-right text-[10px]",
                  mine ? "text-primary-foreground/70" : "text-muted-foreground",
                )}>
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="border-t bg-background p-3">
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileRef.current?.click()}
            disabled={sendAttachment.isPending}
            aria-label="Anexar arquivo"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

          {(currentRole === "admin" || currentRole === "collaborator") && (
            <Button type="button" variant="ghost" size="icon" onClick={() => setTemplatesOpen(true)} aria-label="Mensagens rápidas">
              <Wand2 className="h-4 w-4" />
            </Button>
          )}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="Escreva uma mensagem…"
            className="max-h-32 min-h-10 flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) sendText.mutate(text.trim());
              }
            }}
          />
          <Button
            onClick={() => text.trim() && sendText.mutate(text.trim())}
            disabled={!text.trim() || sendText.isPending}
          >
            <Send className="mr-1 h-4 w-4" /> Enviar
          </Button>
        </div>
        {pendingVars(text).length > 0 && (
          <div className="mt-2 text-[11px] text-amber-700">
            Variáveis sem valor: {pendingVars(text).map((v) => `{${v}}`).join(", ")} — edite antes de enviar.
          </div>
        )}
      </footer>

      <QuickTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        vars={templateVars}
        onPick={(content) => { setText((t) => (t ? t + "\n" : "") + content); setTemplatesOpen(false); }}
      />
    </div>
  );
}

function QuickTemplatesDialog({
  open, onOpenChange, vars, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vars: TemplateVars;
  onPick: (content: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const { data: list = [] } = useQuery({
    queryKey: ["chat-templates"],
    queryFn: async () => (await supabase
      .from("message_templates")
      .select("id, titulo, categoria, escopo, conteudo, ativo")
      .eq("ativo", true)
      .order("titulo")
    ).data ?? [],
    enabled: open,
  });
  const filtered = (list as any[]).filter((t) => {
    if (cat !== "all" && t.categoria !== cat) return false;
    if (q && !`${t.titulo} ${t.conteudo}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Mensagens rápidas</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">Nenhum modelo.</p>}
          {filtered.map((t) => {
            const preview = applyTemplateVars(t.conteudo, vars);
            return (
              <Card key={t.id} className="p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.titulo}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {labelOf(TEMPLATE_CATEGORIES, t.categoria)} · {t.escopo}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onPick(preview)}>Usar</Button>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{preview}</p>
                {pendingVars(preview).length > 0 && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    Variáveis sem valor: {pendingVars(preview).map((v) => `{${v}}`).join(", ")}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewConversationButton() {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const navigate = useNavigate({ from: "/_authenticated/interacoes" });
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({
    queryKey: ["chat-new-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, razao_social, nome_fantasia, documento").eq("status", "active").is("deleted_at", null).order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });
  const start = async () => {
    if (!clientId) return;
    try {
      const id = await ensureConversation(clientId);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["chat-convs"] });
      navigate({ to: "/interacoes", search: { conversation: id }, replace: false });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha");
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nova conversa</Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setClientId(undefined); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Iniciar conversa</DialogTitle></DialogHeader>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
            <SelectContent>
              {(clients as any[]).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social || c.documento || "Empresa"}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={start} disabled={!clientId}>Abrir conversa</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
