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
import { ArrowLeft, MessageSquare, Paperclip, Send, Search, Wand2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ensureConversation } from "@/lib/chat";
import { ClientNewConversationDialog } from "@/components/sc/ClientNewConversationDialog";
import { applyTemplateVars, pendingVars, type TemplateVars } from "@/lib/template-vars";
import { TEMPLATE_CATEGORIES, labelOf } from "@/lib/sc-types";
import { cn } from "@/lib/utils";
import {
  CHAT_SITUATION_FILTERS, CHAT_SITUATION_LABELS, CHAT_SITUATION_TONES, canSeeChatSituation,
  chatSituationEmptyMessage, deriveChatSituation, filterConversationsBySituation,
  parseChatSituationFilter, serializeChatSituationFilter, type ChatSituationFilter,
} from "@/lib/chat-situation";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";

const searchSchema = z.object({
  client: z.string().optional(),
  conversation: z.string().optional(),
  situacao: z.string().optional(),
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
      <PageHeader title="Mensagens" description="Converse e acompanhe as mensagens por empresa." />
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
  last_sender_role: string | null;
  last_message_created_at: string | null;
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

function SituationBadge({ conv, className }: { conv: Conv; className?: string }) {
  const situation = deriveChatSituation(conv.last_sender_role, conv.last_message_created_at);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4",
        CHAT_SITUATION_TONES[situation],
        className,
      )}
    >
      {CHAT_SITUATION_LABELS[situation]}
    </span>
  );
}

function ChatPage() {
  const { role, userId, profile, loading } = useCurrentUser();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isStaff = role === "admin" || role === "collaborator";
  const showSituation = canSeeChatSituation(role);
  const [q, setQ] = useState("");

  // Fase E2.2 — filtro de situação (staff). Cliente ignora o parâmetro.
  const situationFilter: ChatSituationFilter = showSituation
    ? parseChatSituationFilter(search.situacao)
    : "all";

  // Estado da seleção vive na URL (sem matchMedia): mobile mostra lista OU
  // conversa conforme ?conversation; desktop mantém duas colunas.
  const selectedId = search.conversation ?? null;

  // Lista de conversas — fonte única: RPC de metadados (sem conteúdo de mensagem)
  const { data: conversations = [], isLoading: loadingConvs, error: convsError } = useQuery({
    queryKey: ["chat-convs", userId, role],
    enabled: !loading && !!userId && !!role,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_chat_conversations_overview");
      if (error) {
        logChatError("rpc.list_chat_conversations_overview", error, { rpc: "list_chat_conversations_overview" });
        throw error;
      }
      return (data ?? []).map((r) => ({
        id: r.conversation_id,
        client_id: r.client_id,
        last_message_at: r.last_message_at,
        last_sender_role: r.last_sender_role,
        last_message_created_at: r.last_message_created_at,
        clients: { razao_social: r.razao_social, nome_fantasia: r.nome_fantasia },
      })) as Conv[];
    },
  });

  // Realtime: novas conversas / last_message_at
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

  // Se veio ?client=ID, abre a conversa da empresa.
  useEffect(() => {
    if (!search.client || loading || !userId || !role) return;
    if (!isStaff && loadingConvs) return;
    (async () => {
      try {
        // Cliente não insere direto em chat_conversations (RLS): reaproveita a
        // conversa existente; a criação continua pelo botão "Nova conversa".
        if (!isStaff) {
          const existing = conversations.find((c) => c.client_id === search.client);
          if (!existing) {
            toast.info("Use “Nova conversa” para falar com a equipe.");
            navigate({ to: "/interacoes", search: { situacao: search.situacao }, replace: true });
            return;
          }
          navigate({ to: "/interacoes", search: { conversation: existing.id, situacao: search.situacao }, replace: true });
          return;
        }
        const id = await ensureConversation(search.client!);
        qc.invalidateQueries({ queryKey: ["chat-convs"] });
        navigate({ to: "/interacoes", search: { conversation: id, situacao: search.situacao }, replace: true });
      } catch (e: any) {
        toast.error(e?.message ?? "Não foi possível abrir a conversa");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.client, loading, userId, role, loadingConvs]);

  // Normalização: valor inválido (ou cliente com ?situacao) é descartado da URL.
  useEffect(() => {
    if (search.situacao === undefined) return;
    const normalized = showSituation ? serializeChatSituationFilter(situationFilter) : undefined;
    if (normalized === search.situacao) return;
    navigate({ to: "/interacoes", search: { ...search, situacao: normalized }, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.situacao, showSituation, situationFilter]);

  // Ordem: dados autorizados pela RPC → filtro de situação → busca textual.
  const situationConvs = useMemo(
    () => filterConversationsBySituation(conversations, situationFilter),
    [conversations, situationFilter],
  );

  const filteredConvs = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return situationConvs;
    return situationConvs.filter((c) =>
      `${c.clients?.razao_social ?? ""} ${c.clients?.nome_fantasia ?? ""}`.toLowerCase().includes(term),
    );
  }, [situationConvs, q]);

  // Desktop pode cair na primeira conversa do conjunto filtrado; no mobile isso
  // nunca acontece porque o painel só aparece quando existe ?conversation.
  const effectiveId = selectedId ?? filteredConvs[0]?.id ?? null;
  // Busca na lista completa: uma conversa aberta explicitamente não fecha só
  // porque uma nova mensagem mudou a situação dela.
  const activeConv = conversations.find((c) => c.id === effectiveId);

  // client_id -> conversation_id: usado para reaproveitar a conversa única da empresa.
  const existingByClientId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of conversations) map[c.client_id] = c.id;
    return map;
  }, [conversations]);

  const openConversation = (id: string, replace = false) => {
    navigate({ to: "/interacoes", search: { ...search, client: undefined, conversation: id }, replace });
  };

  const backToList = () => {
    navigate({ to: "/interacoes", search: { ...search, conversation: undefined }, replace: true });
  };

  /** Troca manual do filtro: se a conversa aberta sair do conjunto, solta a seleção. */
  const setSituationFilter = (next: ChatSituationFilter) => {
    const nextSet = filterConversationsBySituation(conversations, next);
    const keep = selectedId && nextSet.some((c) => c.id === selectedId);
    navigate({
      to: "/interacoes",
      search: {
        ...search,
        situacao: serializeChatSituationFilter(next),
        conversation: keep ? selectedId : undefined,
      },
      replace: true,
    });
  };

  if (loading || !userId || !role) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-x-hidden supports-[height:100dvh]:h-[calc(100dvh-8rem)]">
      <PageHeader
        title="Mensagens"
        description={isStaff
          ? "Converse com clientes e acompanhe as mensagens por empresa."
          : "Converse com a equipe da Spolaor Company e acompanhe suas mensagens."}
        action={
          isStaff ? (
            <NewConversationButton />
          ) : (
            <ClientNewConversationDialog existingByClientId={existingByClientId} onOpened={openConversation} />
          )
        }
      />

      <Card className="flex min-h-0 flex-1 overflow-hidden p-0">
        {/* Lista de conversas */}
        <aside
          className={cn(
            "min-w-0 flex-col border-r md:flex md:w-80 md:shrink-0",
            selectedId ? "hidden md:flex" : "flex w-full",
          )}
        >
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            {showSituation && (
              <div
                role="group"
                aria-label="Filtrar por situação"
                className="flex flex-wrap gap-1.5 overflow-x-auto"
              >
                {CHAT_SITUATION_FILTERS.map((f) => (
                  <Button
                    key={f.value}
                    type="button"
                    size="sm"
                    variant={situationFilter === f.value ? "default" : "outline"}
                    aria-pressed={situationFilter === f.value}
                    className="h-7 shrink-0 rounded-full px-2.5 text-[11px]"
                    onClick={() => setSituationFilter(f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {convsError ? (
              <div className="p-4 text-xs text-destructive">Falha ao carregar conversas.</div>
            ) : loadingConvs ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
            ) : filteredConvs.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                {q.trim() ? "Nenhuma conversa ainda." : chatSituationEmptyMessage(situationFilter)}
              </div>
            ) : filteredConvs.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id, true)}
                className={cn(
                  "block w-full border-b px-3 py-3 text-left transition hover:bg-muted/50",
                  selectedId === c.id ? "bg-muted" : effectiveId === c.id && "md:bg-muted",
                )}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.clients?.nome_fantasia || c.clients?.razao_social || "Empresa"}</div>
                    {c.clients?.nome_fantasia && c.clients?.razao_social && c.clients.nome_fantasia !== c.clients.razao_social && (
                      <div className="truncate text-[11px] text-muted-foreground">{c.clients.razao_social}</div>
                    )}
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "Sem mensagens"}
                    </div>
                  </div>
                  {showSituation && <SituationBadge conv={c} />}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Painel da conversa */}
        <section
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col md:flex",
            selectedId ? "flex" : "hidden md:flex",
          )}
        >
          {activeConv ? (
            <ChatThread
              conv={activeConv}
              currentUserId={userId}
              currentRole={role as any}
              currentName={profile?.full_name ?? "Você"}
              showSituation={showSituation}
              onBack={backToList}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title="Selecione uma conversa"
                description={isStaff ? "Ou inicie uma nova com qualquer cliente." : "Use “Nova conversa” para falar com a sua contabilidade."}
              />
            </div>
          )}
        </section>
      </Card>
    </div>
  );
}


function ChatThread({
  conv, currentUserId, currentRole, currentName, showSituation, onBack,
}: {
  conv: Conv;
  currentUserId: string | null;
  currentRole: "admin" | "collaborator" | "client" | null;
  currentName: string;
  showSituation: boolean;
  onBack: () => void;
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
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-3 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 md:hidden"
          onClick={onBack}
          aria-label="Voltar para a lista de conversas"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Chat — Empresa</div>
          <div className="truncate font-medium">{conv.clients?.nome_fantasia || conv.clients?.razao_social || "Cliente"}</div>
          {conv.clients?.nome_fantasia && conv.clients?.razao_social && conv.clients.nome_fantasia !== conv.clients.razao_social && (
            <div className="truncate text-xs text-muted-foreground">{conv.clients.razao_social}</div>
          )}
        </div>
        {showSituation ? <SituationBadge conv={conv} className="justify-self-end" /> : <span />}
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden bg-muted/30 p-3 sm:p-4">

        {messagesError ? (
          <div className="mt-12 text-center text-xs text-destructive">Falha ao carregar mensagens.</div>
        ) : loadingMessages ? (
          <div className="mt-12 text-center text-xs text-muted-foreground">Carregando mensagens…</div>
        ) : messages.length === 0 && (
          <div className="mt-12 text-center text-xs text-muted-foreground">
            Nenhuma mensagem ainda. Diga olá! 👋
          </div>
        )}
        {(messages as any[]).filter((m: any) => !m.deleted_at).map((m: any) => {
          const mine = m.sender_profile_id === currentUserId;
          const fromStaff = m.sender_role === "admin" || m.sender_role === "collaborator";
          const removeMsg = async () => {
            if (!confirm("Tem certeza que deseja apagar este item enviado por você?")) return;
            // Fase D3.2 — soft-delete idempotente: só aplica quando ainda não excluída,
            // preservando o primeiro deleted_at/deleted_by. O objeto físico do anexo é
            // removido depois pelo reconciliador interno (janela de 24h).
            const { error } = await supabase
              .from("chat_messages")
              .update({
                deleted_at: new Date().toISOString(),
                deleted_by: currentUserId,
                body: null,
                attachment_path: null,
                attachment_name: null,
                attachment_size: null,
              })
              .eq("id", m.id)
              .is("deleted_at", null);
            if (error) toast.error(/row-level security|permission/i.test(error.message) ? "Sem permissão para excluir." : error.message);
            else qc.invalidateQueries({ queryKey: ["chat-msgs", conv.id] });
          };

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
                  "mt-1 flex items-center justify-end gap-2 text-[10px]",
                  mine ? "text-primary-foreground/70" : "text-muted-foreground",
                )}>
                  {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {mine && (
                    <button type="button" onClick={removeMsg} className="underline opacity-70 hover:opacity-100">
                      apagar
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="shrink-0 border-t bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
        <div className="flex items-end gap-1 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => fileRef.current?.click()}
            disabled={sendAttachment.isPending}
            aria-label="Anexar arquivo"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

          {(currentRole === "admin" || currentRole === "collaborator") && (
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setTemplatesOpen(true)} aria-label="Mensagens rápidas">
              <Wand2 className="h-4 w-4" />
            </Button>
          )}

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="Escreva uma mensagem…"
            className="max-h-32 min-h-10 min-w-0 flex-1 resize-none text-base sm:text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) sendText.mutate(text.trim());
              }
            }}
          />
          <Button
            className="h-10 shrink-0 px-3 sm:px-4"
            onClick={() => text.trim() && sendText.mutate(text.trim())}
            disabled={!text.trim() || sendText.isPending}
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Enviar</span>

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
  const navigate = Route.useNavigate();
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
