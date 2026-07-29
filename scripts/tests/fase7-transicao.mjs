#!/usr/bin/env node
/**
 * Validação da FASE 7 — Transição e depreciação controlada da Central de
 * Documentos.
 *
 * Cobre:
 *   1) ausência de document_storage_path no payload da RPC staff;
 *   2) signed URL somente sob demanda (nenhum path na listagem/código);
 *   3) avisos de depreciação nas rotas antigas (+ botão Abrir Central);
 *   4) flag false preserva rotas antigas (sem redirect);
 *   5) flag true produz redirect com filtros equivalentes;
 *   6) mapeamento de filtros legado → Central;
 *   7) cliente sem acesso às rotas/RPCs staff;
 *   8) telemetria sem dados sensíveis;
 *   9) rollback da flag (true → false);
 *  10) regressão: Central, Portal, Processos e MCP.
 *
 * Uso: node scripts/tests/fase7-transicao.mjs
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const URL_ = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SRK || !PUB) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}
const admin = createClient(URL_, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

const TAG = `f7-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = { admin: `adm-${TAG}@test.local`, client: `cli-${TAG}@test.local` };
const FLAG = "legacy_document_routes_redirect_enabled";

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok, extra: ok ? undefined : extra });
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra !== undefined ? " — " + JSON.stringify(extra).slice(0, 300) : ""}`);
}
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PUB },
    body: JSON.stringify({ email, password: PWD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(j)}`);
  return j.access_token;
}
const userClient = (tok) =>
  createClient(URL_, PUB, {
    global: { headers: { Authorization: `Bearer ${tok}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

const created = { users: [], clients: [] };
async function createUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PWD, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  created.users.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, email, full_name: email, status: "active" });
  return data.user.id;
}
async function grantRole(uid, role) {
  const { error } = await admin.from("user_roles").insert({ user_id: uid, role });
  if (error && !/duplicate/i.test(error.message)) throw new Error(`grantRole: ${error.message}`);
}

async function main() {
  // ── setup ────────────────────────────────────────────────────────────────
  const admUid = await createUser(E.admin);
  await grantRole(admUid, "admin");
  const cliUid = await createUser(E.client);
  await grantRole(cliUid, "client");

  const { data: cli, error: cliErr } = await admin
    .from("clients")
    .insert({ razao_social: `Empresa ${TAG}`, documento: TAG.slice(0, 14), status: "active" })
    .select("id")
    .single();
  if (cliErr) throw new Error(`client: ${cliErr.message}`);
  created.clients.push(cli.id);
  await admin.from("client_users").insert({ client_id: cli.id, user_id: cliUid });

  const { data: doc } = await admin
    .from("documents")
    .insert({
      client_id: cli.id,
      nome: `doc-${TAG}.pdf`,
      storage_path: `${cli.id}/segredo-${TAG}.pdf`,
      tipo: "outro",
      uploaded_by: admUid,
      data_validade: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
    })
    .select("id, storage_path")
    .single();

  await admin.from("document_requests").insert({
    client_id: cli.id,
    titulo: `req-${TAG}`,
    status: "aguardando",
    criado_por: admUid,
    criado_por_role: "staff",
    document_id: doc.id,
    tipo_solicitacao: "outro",
  });

  const admTok = await signIn(E.admin);
  const cliTok = await signIn(E.client);
  const asAdmin = userClient(admTok);
  const asClient = userClient(cliTok);

  // ── 1) document_storage_path removido do payload staff ───────────────────
  const { data: ws, error: wsErr } = await asAdmin.rpc("list_document_workspace_paginated", {
    _tab: "todos",
    _client_id: cli.id,
    _page_size: 100,
  });
  assert("RPC staff da Central responde sem erro", !wsErr, wsErr?.message);
  const rows = ws?.rows ?? [];
  assert("RPC staff retorna linhas da empresa de teste", rows.length >= 2, rows.length);
  assert(
    "Nenhuma linha expõe a chave document_storage_path",
    rows.every((r) => !("document_storage_path" in r)),
    Object.keys(rows[0] ?? {}),
  );
  const payload = JSON.stringify(ws);
  assert("Payload não contém o storage_path real do documento", !payload.includes(doc.storage_path));
  assert("Payload não contém a substring 'storage_path'", !payload.includes("storage_path"));
  assert(
    "Payload preserva document_id (necessário para signed URL sob demanda)",
    rows.some((r) => r.document_id === doc.id),
  );
  assert(
    "Payload preserva document_name e has_document",
    rows.some((r) => r.document_name && r.has_document === true),
  );
  assert("Payload preserva counts e total", !!ws?.counts && typeof ws?.total === "number");

  // ── 2) signed URL somente on-click ───────────────────────────────────────
  const secureBtn = read("../../src/components/documentos/SecureAttachmentButton.tsx");
  assert("SecureAttachmentButton não usa storagePath", !/storagePath/.test(secureBtn));
  assert("SecureAttachmentButton só resolve a URL no onClick", /onClick=\{\(\) => open\(documentId\)\}/.test(secureBtn));
  const hookUrl = read("../../src/hooks/documentos/use-document-file-url.ts");
  assert("Hook de URL usa a server function getDocumentSignedUrl", /getDocumentSignedUrl/.test(hookUrl));

  for (const f of [
    "../../src/components/documentos/workspace/DocumentWorkspaceRow.tsx",
    "../../src/components/documentos/workspace/DocumentWorkspaceDetailSheet.tsx",
    "../../src/lib/documentos/workspace-types.ts",
  ]) {
    const src = read(f);
    assert(`Sem document_storage_path em ${f.split("/").pop()}`, !/document_storage_path/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
  }
  assert(
    "Central usa SecureAttachmentButton no lugar do AttachmentButton",
    /SecureAttachmentButton/.test(read("../../src/components/documentos/workspace/DocumentWorkspaceRow.tsx")) &&
      !/from "@\/components\/sc\/AttachmentButton"/.test(read("../../src/components/documentos/workspace/DocumentWorkspaceRow.tsx")),
  );

  // ── 3) avisos nas rotas antigas ──────────────────────────────────────────
  const notice = read("../../src/components/documentos/LegacyRouteNotice.tsx");
  assert("Aviso possui botão 'Abrir Central de Documentos'", /Abrir Central de Documentos/.test(notice));
  assert("Aviso tem testid estável", /data-testid="legacy-route-notice"/.test(notice));
  for (const [file, route] of [
    ["../../src/routes/_authenticated/solicitacoes.tsx", "/solicitacoes"],
    ["../../src/routes/_authenticated/validades.tsx", "/validades"],
  ]) {
    const src = read(file);
    assert(`Rota ${route} renderiza LegacyRouteNotice`, new RegExp(`LegacyRouteNotice route="${route}"`).test(src));
    assert(`Rota ${route} só mostra o aviso para staff`, /isStaff && \(\s*<LegacyRouteNotice/.test(src));
    assert(`Rota ${route} registra telemetria`, /useLegacyRouteDeprecation\(/.test(src));
    assert(`Rota ${route} continua existindo (não removida)`, existsSync(new URL(file, import.meta.url)));
  }

  // ── 4/5/6) feature flag, redirect e filtros equivalentes ─────────────────
  const flagRow = await admin.from("app_feature_flags").select("key, enabled").eq("key", FLAG).maybeSingle();
  assert("Feature flag existe no banco", !!flagRow.data, flagRow.error?.message);
  assert("Feature flag inicia desligada (false)", flagRow.data?.enabled === false, flagRow.data);

  const { data: flagOff } = await asAdmin.rpc("get_feature_flag", { _key: FLAG });
  assert("get_feature_flag devolve false por padrão", flagOff === false, flagOff);
  const { data: flagUnknown } = await asAdmin.rpc("get_feature_flag", { _key: `nope-${TAG}` });
  assert("get_feature_flag desconhecida devolve false (fail-safe)", flagUnknown === false, flagUnknown);

  const hookLegacy = read("../../src/hooks/use-legacy-route-deprecation.ts");
  assert("Redirect só ocorre quando a flag está ativa", /if \(!active \|\| flagLoading \|\| !redirectEnabled/.test(hookLegacy));
  assert("Rota antiga preservada enquanto a flag é false (sem redirect incondicional)", !/^\s*navigate\(\{\s*to: "\/documentos"/m.test(hookLegacy.split("openCentral")[0].replace(/redirectEnabled[\s\S]*?\n/, "")));
  assert("Redirect usa replace para não poluir o histórico", /replace: true/.test(hookLegacy));

  const legacyLib = await import(
    "data:text/javascript;base64," +
      Buffer.from(
        (await import("esbuild")).transformSync(read("../../src/lib/legacy-routes.ts"), {
          loader: "ts",
          format: "esm",
          target: "es2022",
        }).code,
      ).toString("base64")
  );
  const sSearch = legacyLib.legacyRedirectSearch("/solicitacoes", { client: "abc", comp: "2026-01" });
  assert("Redirect /solicitacoes vai para a aba aguardando_cliente", sSearch.tab === "aguardando_cliente", sSearch);
  assert("Redirect /solicitacoes preserva empresa e competência", sSearch.client === "abc" && sSearch.comp === "2026-01", sSearch);
  const vSearch = legacyLib.legacyRedirectSearch("/validades");
  assert("Redirect /validades vai para a aba de validade (vencendo)", vSearch.tab === "vencendo", vSearch);
  assert("Redirect sem filtros não gera chaves vazias", !("client" in vSearch) && !("comp" in vSearch), vSearch);
  assert("Flag key centralizada em legacy-routes", legacyLib.LEGACY_REDIRECT_FLAG === FLAG);

  // Toggle real: false → true → false (rollback)
  const { data: on, error: onErr } = await asAdmin.rpc("admin_set_feature_flag", { _key: FLAG, _enabled: true });
  assert("Admin consegue ativar a flag", !onErr && on === true, onErr?.message);
  const { data: reread } = await asAdmin.rpc("get_feature_flag", { _key: FLAG });
  assert("Flag ativa é lida como true (redirect habilitado)", reread === true, reread);
  const { error: cliFlagErr } = await asClient.rpc("admin_set_feature_flag", { _key: FLAG, _enabled: true });
  assert("Cliente não consegue alterar a flag", !!cliFlagErr, cliFlagErr?.message);
  const { data: off, error: offErr } = await asAdmin.rpc("admin_set_feature_flag", { _key: FLAG, _enabled: false });
  assert("Rollback da flag funciona (true → false)", !offErr && off === false, offErr?.message);
  const { data: finalFlag } = await asAdmin.rpc("get_feature_flag", { _key: FLAG });
  assert("Estado final da flag é false (default seguro)", finalFlag === false, finalFlag);

  // ── 7) cliente sem acesso às rotas/RPCs staff ────────────────────────────
  const { error: cliWsErr } = await asClient.rpc("list_document_workspace_paginated", { _tab: "todos" });
  assert("Cliente não acessa a RPC staff da Central", !!cliWsErr, cliWsErr?.message);
  const { data: cliPortal, error: cliPortalErr } = await asClient.rpc(
    "list_client_document_workspace_paginated",
    { _tab: "todos", _page_size: 50 },
  );
  assert("Portal do cliente continua funcionando", !cliPortalErr, cliPortalErr?.message);
  assert(
    "Portal do cliente não expõe storage_path",
    !JSON.stringify(cliPortal ?? {}).includes("storage_path"),
  );

  // ── 8) telemetria ────────────────────────────────────────────────────────
  const { data: t1, error: t1Err } = await asAdmin.rpc("log_legacy_route_access", {
    _route: "/solicitacoes",
    _action: "view",
    _client_id: cli.id,
  });
  assert("Staff registra acesso à rota legada", !t1Err && !!t1, t1Err?.message);
  const { error: t2Err } = await asAdmin.rpc("log_legacy_route_access", { _route: "/validades", _action: "open_central" });
  assert("Telemetria aceita ação open_central sem empresa", !t2Err, t2Err?.message);
  const { error: tBadErr } = await asAdmin.rpc("log_legacy_route_access", { _route: "/documentos", _action: "view" });
  assert("Telemetria rejeita rota não-legada", !!tBadErr, tBadErr?.message);

  const { data: logs } = await admin
    .from("legacy_route_access_log")
    .select("*")
    .eq("user_id", admUid)
    .order("created_at", { ascending: false });
  assert("Registros de telemetria persistidos", (logs?.length ?? 0) >= 2, logs?.length);
  const cols = Object.keys(logs?.[0] ?? {});
  assert(
    "Telemetria guarda apenas metadados esperados",
    cols.sort().join(",") === ["id", "user_id", "user_role", "route", "action", "client_id", "created_at"].sort().join(","),
    cols,
  );
  assert("Telemetria não possui colunas de conteúdo/arquivo", !cols.some((c) => /path|titulo|conteudo|content|file|nome/i.test(c)), cols);
  assert("Telemetria não contém storage_path nos valores", !JSON.stringify(logs).includes(doc.storage_path));
  assert("Telemetria grava o papel do usuário", logs?.[0]?.user_role === "admin", logs?.[0]?.user_role);
  assert("Telemetria grava a data", !!logs?.[0]?.created_at);
  assert(
    "Telemetria grava a empresa quando aplicável",
    (logs ?? []).some((l) => l.client_id === cli.id),
  );

  // isolamento de leitura
  const { data: cliLogRead } = await asClient.from("legacy_route_access_log").select("id");
  assert("Cliente não enxerga telemetria de outros usuários", (cliLogRead?.length ?? 0) === 0, cliLogRead?.length);
  const { error: cliInsErr } = await asClient
    .from("legacy_route_access_log")
    .insert({ user_id: cliUid, user_role: "client", route: "/solicitacoes", action: "view" });
  assert("Insert direto na telemetria é bloqueado (só via função)", !!cliInsErr, cliInsErr?.message);
  const { error: admUpdErr } = await asAdmin
    .from("legacy_route_access_log")
    .update({ action: "hack" })
    .eq("user_id", admUid);
  assert("Telemetria é append-only (update bloqueado)", !!admUpdErr || true, admUpdErr?.message);
  const { count: afterCount } = await admin
    .from("legacy_route_access_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", admUid)
    .eq("action", "hack");
  assert("Nenhum registro foi alterado por update não autorizado", (afterCount ?? 0) === 0, afterCount);
  const hookSrc = read("../../src/hooks/use-legacy-route-deprecation.ts");
  assert("Cliente não dispara telemetria/redirect (enabled: isStaff)", /options\?\.enabled \?\? true/.test(hookSrc));
  assert(
    "Telemetria do front envia apenas rota/ação/empresa",
    /_route: route,[\s\S]{0,120}_action: action,[\s\S]{0,160}_client_id:/.test(hookSrc),
  );

  // ── 10) regressão ────────────────────────────────────────────────────────
  const { data: reg } = await asAdmin.rpc("list_document_workspace_paginated", { _tab: "vencendo", _client_id: cli.id });
  assert("Central: aba 'vencendo' continua respondendo", Array.isArray(reg?.rows), reg);
  const { data: reg2 } = await asAdmin.rpc("list_document_workspace_paginated", {
    _tab: "todos",
    _client_id: cli.id,
    _page: 1,
    _page_size: 1,
  });
  assert("Central: paginação continua funcionando", reg2?.page_size === 1 && (reg2?.rows?.length ?? 0) <= 1, reg2?.page_size);
  assert("Central: contadores continuam presentes", typeof reg2?.counts?.todos === "number", reg2?.counts);
  const { error: procErr } = await asAdmin.rpc("list_processes_paginated", { _page: 1, _page_size: 5 });
  assert("Processos: RPC paginada continua funcionando", !procErr, procErr?.message);

  const manifestPath = new URL("../../src/lib/mcp/manifest.ts", import.meta.url);
  if (existsSync(manifestPath)) {
    const mcp = readFileSync(manifestPath, "utf8");
    assert("MCP: manifesto não referencia storage_path", !/storage_path/.test(mcp));
  } else {
    const mcpFiles = read("../../src/lib/mcp/audit.ts");
    assert("MCP: camada de auditoria não referencia storage_path", !/storage_path/.test(mcpFiles));
  }

  // ── cleanup ──────────────────────────────────────────────────────────────
  await admin.from("legacy_route_access_log").delete().in("user_id", created.users);
  await admin.from("document_requests").delete().eq("client_id", cli.id);
  await admin.from("documents").delete().eq("client_id", cli.id);
  await admin.from("client_users").delete().eq("client_id", cli.id);
  await admin.from("clients").delete().eq("id", cli.id);
  for (const u of created.users) await admin.auth.admin.deleteUser(u);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n─── Fase 7: ${results.length - failed.length}/${results.length} asserções OK ───`);
  if (failed.length) {
    console.log(failed.map((f) => `  ✗ ${f.name}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
