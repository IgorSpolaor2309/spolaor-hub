import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_BUCKET,
  DELETE_BATCH_SIZE,
  LIST_PAGE_SIZE,
  MAX_DELETIONS_PER_RUN,
  classify,
  emptySummary,
  isStrictChatPath,
  type Candidate,
  type RunSummary,
} from "@/lib/chat-orphans";
import { cronUnauthorized, isAuthorizedCronRequest } from "@/lib/cron-auth";

/**
 * Fase D3.2 — reconciliador interno de anexos órfãos de Mensagens.
 *
 * Endpoint técnico, invisível ao usuário (nenhuma tela, menu ou módulo).
 * Chamado apenas pelo pg_cron; autenticado pelo mesmo mecanismo já adotado no
 * projeto (helper central de cron: CRON_SECRET / cron_internal_secret no Vault)
 * e usando SERVICE_ROLE_KEY somente
 * dentro do handler. Nada vindo do navegador é considerado confiável: nenhum
 * client_id, caminho ou lista de arquivos é aceito no corpo.
 *
 * Modos: "dry-run" (padrão, apenas calcula) e "effective" (remove pela API
 * oficial do Storage). Nenhum caminho, nome, empresa ou usuário é logado ou
 * retornado — apenas contadores agregados.
 */

type Admin = SupabaseClient<any, any, any>;

type StorageEntry = { name: string; id: string | null; created_at?: string | null; metadata?: any };

async function listAll(admin: Admin, prefix: string): Promise<StorageEntry[]> {
  const out: StorageEntry[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin.storage
      .from(CHAT_BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error("storage_list_failed");
    const page = (data ?? []) as StorageEntry[];
    out.push(...page);
    if (page.length < LIST_PAGE_SIZE) break;
  }
  return out;
}

/** Enumera exclusivamente objetos sob `<uuid>/chat/**`. Nunca sai desse prefixo. */
async function collectChatObjects(admin: Admin): Promise<Candidate[]> {
  const found: Candidate[] = [];
  const roots = await listAll(admin, "");
  for (const root of roots) {
    if (root.id) continue; // arquivo solto na raiz: fora do prefixo de chat
    const clientPrefix = `${root.name}/chat`;
    let level1: StorageEntry[];
    try {
      level1 = await listAll(admin, clientPrefix);
    } catch {
      continue;
    }
    for (const entry of level1) {
      if (entry.id) {
        // arquivo direto em <uuid>/chat/<arquivo> → 3 segmentos, válido
        push(found, `${clientPrefix}/${entry.name}`, entry);
        continue;
      }
      const sub = await listAll(admin, `${clientPrefix}/${entry.name}`);
      for (const file of sub) {
        if (!file.id) continue; // não descemos além de <cliente>/chat/<pasta>/<arquivo>
        push(found, `${clientPrefix}/${entry.name}/${file.name}`, file);
      }
    }
  }
  return found;
}

function push(acc: Candidate[], path: string, entry: StorageEntry) {
  if (!isStrictChatPath(path)) return;
  acc.push({
    path,
    createdAt: entry.created_at ?? null,
    size: Number(entry.metadata?.size ?? 0) || 0,
    referenced: false,
  });
}

/** Marca como referenciado tudo que aparecer em chat_messages ou em qualquer outra tabela conhecida. */
async function markReferences(admin: Admin, candidates: Candidate[]): Promise<void> {
  const byPath = new Map(candidates.map((c) => [c.path, c]));
  const paths = [...byPath.keys()];
  for (let i = 0; i < paths.length; i += 50) {
    const chunk = paths.slice(i, i + 50);
    const queries = [
      admin.from("chat_messages").select("attachment_path").in("attachment_path", chunk),
      admin.from("documents").select("storage_path").in("storage_path", chunk),
      admin.from("tax_guides").select("storage_path").in("storage_path", chunk),
      admin.from("tax_guides").select("comprovante_path").in("comprovante_path", chunk),
      admin
        .from("document_requests")
        .select("attachment_final_path")
        .in("attachment_final_path", chunk),
    ];
    const results = await Promise.all(queries);
    for (const r of results) {
      if (r.error) throw new Error("reference_check_failed");
      for (const row of (r.data ?? []) as Array<Record<string, string | null>>) {
        for (const v of Object.values(row)) {
          const c = v ? byPath.get(v) : undefined;
          if (c) c.referenced = true;
        }
      }
    }
  }
}

async function stillUnreferenced(admin: Admin, chunk: string[]): Promise<Set<string>> {
  const probe: Candidate[] = chunk.map((p) => ({
    path: p,
    createdAt: null,
    size: 0,
    referenced: false,
  }));
  await markReferences(admin, probe);
  return new Set(probe.filter((c) => !c.referenced).map((c) => c.path));
}

export const Route = createFileRoute("/api/public/hooks/cleanup-chat-orphans")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        if (!(await isAuthorizedCronRequest(request))) return cronUnauthorized();

        const raw = (await request.json().catch(() => ({}))) as { mode?: unknown };
        const mode: RunSummary["mode"] = raw?.mode === "effective" ? "effective" : "dry-run";
        const summary = emptySummary(mode);

        const url = process.env.SUPABASE_URL;
        const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !svc) {
          return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const admin = createClient(url, svc, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        try {
          const candidates = await collectChatObjects(admin);
          await markReferences(admin, candidates);
          const now = new Date();

          const eligible: Candidate[] = [];
          for (const c of candidates) {
            summary.analyzed += 1;
            if (classify(c, now) === "orphan") eligible.push(c);
            else summary.preserved += 1;
          }
          summary.eligible = eligible.length;
          summary.bytes_eligible = eligible.reduce((a, c) => a + c.size, 0);

          const capped = eligible.slice(0, MAX_DELETIONS_PER_RUN);
          summary.capped = eligible.length > capped.length;

          if (mode === "effective") {
            for (let i = 0; i < capped.length; i += DELETE_BATCH_SIZE) {
              const batch = capped.slice(i, i + DELETE_BATCH_SIZE);
              // Revalidação imediatamente antes da remoção (janela de corrida).
              let safe: Set<string>;
              try {
                safe = await stillUnreferenced(admin, batch.map((c) => c.path));
              } catch {
                summary.failed += batch.length;
                continue;
              }
              const toRemove = batch.filter((c) => safe.has(c.path));
              summary.preserved += batch.length - toRemove.length;
              if (toRemove.length === 0) continue;
              const { error } = await admin.storage
                .from(CHAT_BUCKET)
                .remove(toRemove.map((c) => c.path));
              if (error) {
                // Falha parcial: objetos permanecem para a próxima execução.
                summary.failed += toRemove.length;
                continue;
              }
              // Objeto ausente é tratado como sucesso pela API de remoção.
              summary.removed += toRemove.length;
              summary.bytes_removed += toRemove.reduce((a, c) => a + c.size, 0);
            }
          }

          summary.duration_ms = Date.now() - startedAt;
          console.log("cleanup-chat-orphans", JSON.stringify(summary));
          return new Response(JSON.stringify({ ok: true, ...summary }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          summary.duration_ms = Date.now() - startedAt;
          summary.failed += 1;
          console.error(
            "cleanup-chat-orphans failed",
            JSON.stringify({ ...summary, reason: (err as Error)?.message ?? "unexpected" }),
          );
          return new Response(JSON.stringify({ ok: false, error: "run_failed", ...summary }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
