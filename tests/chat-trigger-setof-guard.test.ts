import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regressão E2.5/E2.6 — `set-returning functions are not allowed in CASE`.
 *
 * A definição vigente de public.on_chat_message_insert() é a última migration
 * que a redefine. Nenhuma função SETOF (client_user_ids / client_staff_user_ids
 * / unnest) pode aparecer dentro de CASE, COALESCE ou expressão escalar.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SET_RETURNING = ["client_user_ids", "client_staff_user_ids", "unnest"];

function latestTriggerDefinition(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let def: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const match = /CREATE OR REPLACE FUNCTION public\.on_chat_message_insert\(\)[\s\S]*?AS \$function\$[\s\S]*?\$function\$/i.exec(sql);
    if (match) def = match[0];
  }
  if (!def) throw new Error("definição de on_chat_message_insert() não encontrada nas migrations");
  return def;
}

describe("on_chat_message_insert — guarda contra função set-returning em CASE", () => {
  const def = latestTriggerDefinition();

  it("não chama função set-returning dentro de CASE", () => {
    const caseBlocks = def.match(/\bCASE\b[\s\S]*?\bEND\b/gi) ?? [];
    for (const block of caseBlocks) {
      for (const fn of SET_RETURNING) {
        expect(block.toLowerCase()).not.toContain(fn);
      }
    }
  });

  it("não chama função set-returning dentro de COALESCE", () => {
    const coalesce = def.match(/COALESCE\s*\([^;]*?\)/gi) ?? [];
    for (const block of coalesce) {
      for (const fn of SET_RETURNING) {
        expect(block.toLowerCase()).not.toContain(fn);
      }
    }
  });

  it("resolve destinatários com controle procedural por papel", () => {
    expect(def).toMatch(/IF\s+NEW\.sender_role\s*=\s*'client'\s+THEN/i);
    expect(def).toMatch(/FROM public\.client_staff_user_ids\(NEW\.client_id\)/);
    expect(def).toMatch(/FROM public\.client_user_ids\(NEW\.client_id\)/);
  });

  it("preserva consolidação, trava e link canônico", () => {
    expect(def).toContain("pg_advisory_xact_lock");
    expect(def).toContain("notify_user");
    expect(def).toContain("/interacoes?conversation=");
    expect(def).toMatch(/SECURITY DEFINER/i);
    expect(def).toMatch(/SET search_path TO 'public'/i);
    expect(def).toContain("last_message_at");
  });
});
