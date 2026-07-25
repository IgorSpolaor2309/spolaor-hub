#!/usr/bin/env node
/**
 * Testes unitários — comportamento pertinente do hook useProfilesMap.
 *
 * Testamos:
 *   1) A chave estável derivada dos ids (dedup + sort + descarte de nulos).
 *   2) O seletor de colunas usado pela query (id, full_name — sem email/PII).
 *   3) O comportamento de N+1: o módulo Processos referencia `.from("profiles")`
 *      em EXATAMENTE UM ponto (o próprio hook).
 *
 * O primeiro grupo é validação pura da função `profileMapKey` importada.
 * O segundo/terceiro são inspeções estáticas do fonte — a evidência que o
 * enunciado exige de que o detalhe não emite consultas separadas por seção.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

const results = [];
function it(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log(`✅ ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e?.message ?? e }); console.log(`❌ ${name} — ${e?.message ?? e}`); }
}

// ─── 1) profileMapKey (função pura) ──────────────────────────────────────────
// Import do TS via esbuild em memória (sem depender de vitest/tsx).
const src = readFileSync(new URL("../../src/hooks/use-profiles-map.ts", import.meta.url), "utf8");
const stripped = src
  .replace(/^\s*import\s+\{\s*useQuery\s*\}\s+from\s+["']@tanstack\/react-query["'];?\s*$/m, "")
  .replace(/^\s*import\s+\{\s*supabase\s*\}\s+from\s+["']@\/integrations\/supabase\/client["'];?\s*$/m, "")
  .replace(/export function useProfilesMap[\s\S]*$/m, "");
const { code } = transformSync(stripped, { loader: "ts", format: "esm", target: "es2022" });
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const { profileMapKey } = mod;

it("dedup de ids repetidos", () => {
  assert.deepEqual(profileMapKey(["a", "b", "a", "c", "b"]), ["a", "b", "c"]);
});
it("chave é estável independente da ordem de entrada", () => {
  const k1 = profileMapKey(["z", "a", "m"]).join(",");
  const k2 = profileMapKey(["m", "z", "a"]).join(",");
  const k3 = profileMapKey(["a", "m", "z"]).join(",");
  assert.equal(k1, k2);
  assert.equal(k2, k3);
});
it("lista vazia retorna []", () => {
  assert.deepEqual(profileMapKey([]), []);
});
it("lista só com null/undefined retorna []", () => {
  assert.deepEqual(profileMapKey([null, undefined, null]), []);
});
it("null/undefined/'' são descartados (responsável nulo é ignorado)", () => {
  assert.deepEqual(profileMapKey(["a", null, "b", undefined, "", "a"]), ["a", "b"]);
});

// ─── 2) Contrato: só seleciona id e full_name ────────────────────────────────
it("useProfilesMap seleciona apenas id, full_name (sem email/PII)", () => {
  // O regex é permissivo mas ancorado ao literal do select
  assert.match(src, /\.select\(\s*["']id,\s*full_name["']\s*\)/);
  assert.doesNotMatch(src, /\.select\([^)]*email/i);
});

// ─── 3) N+1: número real de queries a profiles no módulo Processos ───────────
const files = [
  "src/routes/_authenticated/processos.tsx",
  "src/routes/_authenticated/processos.$id.tsx",
  "src/routes/_authenticated/meus-processos.tsx",
  "src/hooks/use-profiles-map.ts",
];
let totalHits = 0;
const perFile = {};
for (const f of files) {
  const content = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
  const hits = (content.match(/\.from\(\s*["']profiles["']\s*\)/g) || []).length;
  perFile[f] = hits;
  totalHits += hits;
}
it("N+1 removido: apenas 1 chamada a .from('profiles') em todo o módulo", () => {
  assert.equal(totalHits, 1, `Chamadas encontradas: ${JSON.stringify(perFile)}`);
});
it("N+1 removido: essa chamada está exclusivamente no hook compartilhado", () => {
  assert.equal(perFile["src/hooks/use-profiles-map.ts"], 1, JSON.stringify(perFile));
  assert.equal(perFile["src/routes/_authenticated/processos.tsx"], 0);
  assert.equal(perFile["src/routes/_authenticated/processos.$id.tsx"], 0);
  assert.equal(perFile["src/routes/_authenticated/meus-processos.tsx"], 0);
});

// ─── 4) Detalhe usa useProfilesMap para todas as seções (main + steps + timeline)
const detail = readFileSync(new URL("../../src/routes/_authenticated/processos.$id.tsx", import.meta.url), "utf8");
it("detalhe do processo importa e usa useProfilesMap", () => {
  assert.match(detail, /useProfilesMap/);
});
it("detalhe do processo não emite `.from(\"profiles\")` isoladamente", () => {
  assert.doesNotMatch(detail, /\.from\(\s*["']profiles["']\s*\)/);
});

// ─── 5) meus-processos e processos.tsx não fazem N+1 tampouco ────────────────
for (const f of ["src/routes/_authenticated/processos.tsx", "src/routes/_authenticated/meus-processos.tsx"]) {
  const content = readFileSync(new URL("../../" + f, import.meta.url), "utf8");
  it(`${f}: sem consulta direta a profiles`, () => {
    assert.doesNotMatch(content, /\.from\(\s*["']profiles["']\s*\)/);
  });
}

// ─── 6) meus-processos não usa mais .limit(500) ──────────────────────────────
const meus = readFileSync(new URL("../../src/routes/_authenticated/meus-processos.tsx", import.meta.url), "utf8");
it("meus-processos: .limit(500) removido", () => {
  assert.doesNotMatch(meus, /\.limit\(\s*500\s*\)/);
});

// ─── Resumo ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\nResumo: ${results.length - failed.length}/${results.length} OK`);
if (failed.length) {
  for (const f of failed) console.log(" - " + f.name + " — " + f.err);
  process.exit(1);
}
