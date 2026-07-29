import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 6 — acesso seguro a arquivos.
 *
 * O cliente NUNCA recebe `storage_path`. Esta função valida a permissão no
 * banco (can_user_access_document: admin, dono da carteira, colaborador
 * vinculado ou usuário da própria empresa) e devolve apenas uma URL
 * temporária. O caminho interno permanece exclusivamente no servidor.
 */
export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; expiresIn?: number }) => {
    const id = String(data?.documentId ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error("Documento inválido.");
    }
    const expires = Number(data?.expiresIn ?? 60);
    return {
      documentId: id,
      expiresIn: Number.isFinite(expires) ? Math.min(Math.max(expires, 15), 300) : 60,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: allowed, error: rpcError } = await context.supabase.rpc(
      "can_user_access_document",
      { _user_id: context.userId, _document_id: data.documentId },
    );
    if (rpcError) throw new Error("Não foi possível validar o acesso ao arquivo.");
    if (allowed !== true) throw new Error("Sem acesso a este arquivo.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .select("storage_path")
      .eq("id", data.documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (docError) throw new Error("Não foi possível localizar o arquivo.");
    if (!doc?.storage_path) throw new Error("Este item não possui arquivo anexado.");

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, data.expiresIn);
    if (signError || !signed?.signedUrl) {
      throw new Error("Não foi possível gerar o link do arquivo.");
    }

    // Somente a URL temporária atravessa a fronteira servidor -> cliente.
    return { url: signed.signedUrl, expiresIn: data.expiresIn };
  });
