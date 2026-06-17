/**
 * Helpers de conversa do chat interno.
 */
import { supabase } from "@/integrations/supabase/client";

/** Garante que existe uma conversa para o cliente; retorna o id. */
export async function ensureConversation(clientId: string): Promise<string> {
  const { data: existing } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ client_id: clientId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
