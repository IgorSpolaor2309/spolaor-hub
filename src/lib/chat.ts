/**
 * Helpers de conversa do chat interno.
 */
import { supabase } from "@/integrations/supabase/client";

/** Garante que existe uma conversa para o cliente; retorna o id. */
export async function ensureConversation(clientId: string): Promise<string> {
  const { data: existing, error: lookupError } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (lookupError) {
    console.error("[chat] Falha ao procurar conversa", {
      action: "chat_conversations.select.maybeSingle",
      table: "chat_conversations",
      clientId,
      code: lookupError.code,
      message: lookupError.message,
      details: lookupError.details,
      hint: lookupError.hint,
    });
    throw lookupError;
  }
  if (existing?.id) return existing.id;
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ client_id: clientId })
    .select("id")
    .single();
  if (error) {
    console.error("[chat] Falha ao criar conversa", {
      action: "chat_conversations.insert",
      table: "chat_conversations",
      clientId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  return data.id;
}
