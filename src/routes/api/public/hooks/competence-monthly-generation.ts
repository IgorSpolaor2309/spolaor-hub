import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron: prepara automaticamente a competência do mês corrente.
 * Chamado pelo pg_cron no dia 1 de cada mês. Público sob /api/public/*,
 * autenticado por um segredo server-only (CRON_SECRET) e SERVICE_ROLE_KEY dentro do handler.
 *
 * O corpo do POST aceita { competence?: "YYYY-MM" }. Se omitido, usa o mês atual (UTC).
 * A função SQL admin_generate_monthly_competences é idempotente
 * (unique(client_id, competence)); execuções repetidas nunca duplicam registros.
 */
export const Route = createFileRoute("/api/public/hooks/competence-monthly-generation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const provided =
            request.headers.get("x-cron-secret") ??
            (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
          const expected = process.env.CRON_SECRET ?? "";
          const ok =
            expected.length > 0 &&
            provided.length === expected.length &&
            (() => {
              let diff = 0;
              for (let i = 0; i < expected.length; i++) {
                diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
              }
              return diff === 0;
            })();
          if (!ok) {
            return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
              status: 401, headers: { "Content-Type": "application/json" },
            });
          }

          const body = await request.json().catch(() => ({} as any)) as { competence?: string };
          const now = new Date();
          const auto = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
          const comp = body.competence && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.competence)
            ? body.competence
            : auto;

          const url = process.env.SUPABASE_URL!;
          const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          if (!url || !svc) {
            return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }

          const admin = createClient(url, svc, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data, error } = await admin.rpc("admin_generate_monthly_competences", {
            p_competence: comp,
            p_scope: "real", // cron nunca opera fora do escopo real
            p_source: "cron",
          });
          if (error) {
            console.error("competence-cron rpc error:", error.message);
            return new Response(JSON.stringify({ ok: false, error: "generation_failed" }), {
              status: 500, headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ok: true, competence: comp, result: data }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("competence-cron unexpected:", err);
          return new Response(JSON.stringify({ ok: false, error: "unexpected" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
