#!/usr/bin/env node
/**
 * Validação — Pendências do CLIENTE ("O que preciso fazer" em /minhas-pendencias).
 *
 * Fonte única: RPC public.client_list_pending_actions (SECURITY DEFINER).
 * Cobre: visibilidade por status, isolamento multiempresa, bloqueio de client_id
 * externo, ausência de campos internos, filtros/contadores/paginação server-side,
 * remoção do item após upload e permanência após "reenviar".
 *
 * Uso: node scripts/tests/client-pendencias.mjs
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const URL_ = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SRK || !PUB) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}
const admin = createClient(URL_, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

const TAG = `cpend-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = { admin: `adm-${TAG}@test.local`, client: `cli-${TAG}@test.local` };

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra !== undefined ? " — " + JSON.stringify(extra).slice(0, 300) : ""}`);
}

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

const created = { users: [], clients: [], reqs: [], guides: [], paths: [] };

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
async function mkClient(nome) {
  const { data, error } = await admin
    .from("clients")
    .insert({ razao_social: nome, status: "ativo", origem_cadastro: "manual" })
    .select("id")
    .single();
  if (error) throw new Error(`mkClient: ${error.message}`);
  created.clients.push(data.id);
  return data.id;
}
async function mkReq(clientId, patch) {
  const { data, error } = await admin
    .from("document_requests")
    .insert({
      client_id: clientId,
      titulo: `${TAG} ${patch.titulo}`,
      status: patch.status,
      criado_por_role: patch.criado_por_role ?? "staff",
      urgencia: "normal",
      competencia: patch.competencia ?? "2026-06",
      tipo_solicitacao: "outro",
    })
    .select("id")
    .single();
  if (error) throw new Error(`mkReq(${patch.titulo}): ${error.message}`);
  created.reqs.push(data.id);
  return data.id;
}

const ctx = {};

async function setup() {
  const adminId = await createUser(E.admin);
  const clientUid = await createUser(E.client);
  await grantRole(adminId, "admin");
  await grantRole(clientUid, "client");
  ctx.clientUid = clientUid;

  ctx.cA = await mkClient(`${TAG} Empresa A`);
  ctx.cB = await mkClient(`${TAG} Empresa B`);
  const { error: cuErr } = await admin
    .from("client_users")
    .insert({ client_id: ctx.cA, user_id: clientUid, ativo: true, papel: "titular" });
  if (cuErr) throw new Error(`client_users: ${cuErr.message}`);

  ctx.reqAguardando = await mkReq(ctx.cA, { titulo: "aguardando", status: "aguardando", criado_por_role: "staff" });
  ctx.reqAguardandoStaffOwner = await mkReq(ctx.cA, { titulo: "aguardando-staff", status: "aguardando", criado_por_role: "client" });
  ctx.reqReenviar = await mkReq(ctx.cA, { titulo: "reenviar", status: "reenviar", criado_por_role: "staff" });
  ctx.reqRecebido = await mkReq(ctx.cA, { titulo: "recebido", status: "recebido", criado_por_role: "staff" });
  ctx.reqConcluido = await mkReq(ctx.cA, { titulo: "concluido", status: "concluido", criado_por_role: "staff" });
  ctx.reqCancelado = await mkReq(ctx.cA, { titulo: "cancelado", status: "cancelado", criado_por_role: "staff" });
  ctx.reqB = await mkReq(ctx.cB, { titulo: "empresaB", status: "aguardando", criado_por_role: "staff" });

  for (let i = 0; i < 4; i++) {
    await mkReq(ctx.cA, { titulo: `bulk-${i}`, status: "aguardando", criado_por_role: "staff" });
  }

  // Guia com arquivo e sem comprovante → ação do cliente
  const gPath = `${ctx.cA}/${TAG}-guia.txt`;
  await admin.storage.from("documents").upload(gPath, new Blob(["guia"]), { contentType: "text/plain" });
  created.paths.push(gPath);
  const { data: g, error: gErr } = await admin
    .from("tax_guides")
    .insert({ client_id: ctx.cA, tipo: `${TAG} DAS`, status: "pendente", competencia: "2026-06", storage_path: gPath })
    .select("id")
    .single();
  if (gErr) throw new Error(`tax_guides: ${gErr.message}`);
  created.guides.push(g.id);
  ctx.guia = g.id;

  ctx.CL = userClient(await signIn(E.client));
  ctx.AD = userClient(await signIn(E.admin));
}

async function teardown() {
  try {
    if (created.paths.length) await admin.storage.from("documents").remove(created.paths);
    if (created.clients.length) {
      await admin.from("document_request_files").delete().in("document_request_id", created.reqs);
      await admin.from("document_requests").delete().in("client_id", created.clients);
      await admin.from("tax_guides").delete().in("client_id", created.clients);
      await admin.from("documents").delete().in("client_id", created.clients);
      await admin.from("timeline_events").delete().in("client_id", created.clients);
      await admin.from("client_users").delete().in("client_id", created.clients);
      await admin.from("clients").delete().in("id", created.clients);
    }
    for (const u of created.users) {
      await admin.from("notifications").delete().eq("user_id", u);
      await admin.from("user_roles").delete().eq("user_id", u);
      await admin.auth.admin.deleteUser(u);
    }
  } catch (e) {
    console.log("teardown warn:", e.message);
  }
}

const pend = (c, args = {}) => c.rpc("client_list_pending_actions", { _page_size: 100, ...args });

const INTERNAL_FIELDS = [
  "observacoes_internas", "storage_path", "comprovante_path", "responsavel_profile_id",
  "responsavel_id", "demo_batch_id", "criado_por", "criado_por_role", "deleted_by",
];

async function run() {
  await setup();
  const { CL, AD } = ctx;

  // 1 / 2 — aguardando e reenviar aparecem
  const base = await pend(CL);
  assert("RPC responde para o cliente autenticado", !base.error, base.error);
  const rows = base.data?.rows ?? [];
  const ids = rows.map((r) => r.item_id);
  assert("1. solicitação 'aguardando' aparece", ids.includes(ctx.reqAguardando));
  assert("2. solicitação 'reenviar' aparece", ids.includes(ctx.reqReenviar));
  assert("2b. status externo de reenviar é 'Reenvio solicitado'",
    rows.find((r) => r.item_id === ctx.reqReenviar)?.status_label === "Reenvio solicitado");
  assert("2c. status externo de aguardando é 'Aguardando envio'",
    rows.find((r) => r.item_id === ctx.reqAguardando)?.status_label === "Aguardando envio");

  // 3 / 4 — recebido / concluído / cancelado não aparecem
  assert("3. solicitação 'recebido' não aparece", !ids.includes(ctx.reqRecebido));
  assert("4. solicitação 'concluido' não aparece", !ids.includes(ctx.reqConcluido));
  assert("4b. solicitação 'cancelado' não aparece", !ids.includes(ctx.reqCancelado));
  assert("4c. aguardando cuja ação é da contabilidade não aparece", !ids.includes(ctx.reqAguardandoStaffOwner));
  assert("4d. todas as linhas têm action_owner = client", rows.every((r) => r.action_owner === "client"));

  // 5 — isolamento multiempresa
  assert("5. cliente não vê solicitação de outra empresa", !ids.includes(ctx.reqB));
  assert("5b. todas as linhas pertencem à empresa vinculada", rows.every((r) => r.client_id === ctx.cA));

  // 6 — client_id externo bloqueado
  const forced = await pend(CL, { _client_id: ctx.cB });
  assert("6. forçar _client_id externo retorna vazio", (forced.data?.rows ?? []).length === 0, forced.data?.rows?.length);
  assert("6b. contadores zerados ao forçar empresa externa", (forced.data?.counts?.todos ?? -1) === 0, forced.data?.counts);

  // guias
  assert("guia sem comprovante aparece como ação do cliente", ids.includes(ctx.guia));
  assert("guia usa rótulo externo 'Aguardando comprovante'",
    rows.find((r) => r.item_id === ctx.guia)?.status_label === "Aguardando comprovante");

  // 11 — nenhum campo interno vaza
  const leaked = new Set();
  for (const r of rows) for (const f of INTERNAL_FIELDS) if (f in r) leaked.add(f);
  assert("11. nenhum campo interno no payload", leaked.size === 0, [...leaked]);

  // 12 — filtros / contadores / paginação server-side
  const p1 = await pend(CL, { _page: 1, _page_size: 2 });
  const p2 = await pend(CL, { _page: 2, _page_size: 2 });
  assert("12. paginação server-side devolve page_size respeitado", (p1.data?.rows ?? []).length === 2, p1.data?.rows?.length);
  assert("12b. página 2 traz itens diferentes",
    !(p2.data?.rows ?? []).some((r) => (p1.data?.rows ?? []).some((x) => x.item_id === r.item_id)));
  assert("12c. total é server-side e maior que a página", (p1.data?.total ?? 0) > 2, p1.data?.total);
  assert("12d. contadores server-side coerentes",
    (base.data?.counts?.todos ?? 0) === rows.length &&
    (base.data?.counts?.reenvio_solicitado ?? 0) === 1 &&
    (base.data?.counts?.guias ?? 0) === 1, base.data?.counts);

  const filtroKind = await pend(CL, { _kind: "tax_guide" });
  assert("12e. filtro por tipo (guia) é server-side",
    (filtroKind.data?.rows ?? []).every((r) => r.item_kind === "tax_guide") &&
    (filtroKind.data?.rows ?? []).length === 1, filtroKind.data?.rows?.length);
  const filtroBusca = await pend(CL, { _search: "reenviar" });
  assert("12f. busca é server-side",
    (filtroBusca.data?.rows ?? []).length === 1 &&
    filtroBusca.data.rows[0].item_id === ctx.reqReenviar, filtroBusca.data?.rows?.length);
  const kindInvalido = await pend(CL, { _kind: "hack" });
  assert("12g. _kind inválido é rejeitado", !!kindInvalido.error);

  // 8 / 9 — upload remove o item; reenviar mantém
  {
    const path = `${ctx.cA}/${TAG}-envio.txt`;
    const up = await admin.storage.from("documents").upload(path, new Blob(["envio"]), { contentType: "text/plain" });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    created.paths.push(path);
    const { error: subErr } = await CL.rpc("client_submit_document_request", {
      _request_id: ctx.reqAguardando,
      _storage_path: path,
      _nome: "envio.txt",
      _tipo: "outro",
    });
    assert("8. cliente consegue enviar o documento", !subErr, subErr);
    const after = await pend(CL);
    const afterIds = (after.data?.rows ?? []).map((r) => r.item_id);
    assert("8b. item enviado sai da lista de pendências", !afterIds.includes(ctx.reqAguardando));

    // staff pede reenvio → volta a aparecer
    await admin.from("document_requests").update({ status: "reenviar" }).eq("id", ctx.reqAguardando);
    const back = await pend(CL);
    const backIds = (back.data?.rows ?? []).map((r) => r.item_id);
    assert("9. reenvio solicitado devolve o item à lista", backIds.includes(ctx.reqAguardando));

    // novo envio remove de novo
    const path2 = `${ctx.cA}/${TAG}-envio2.txt`;
    await admin.storage.from("documents").upload(path2, new Blob(["envio2"]), { contentType: "text/plain" });
    created.paths.push(path2);
    const { error: sub2 } = await CL.rpc("client_submit_document_request", {
      _request_id: ctx.reqAguardando,
      _storage_path: path2,
      _nome: "envio2.txt",
      _tipo: "outro",
    });
    assert("9b. novo envio aceito", !sub2, sub2);
    const after2 = await pend(CL);
    assert("9c. item sai da lista após o novo envio",
      !(after2.data?.rows ?? []).some((r) => r.item_id === ctx.reqAguardando));
  }

  // 10 — colaborador/admin mantém a visão consolidada de staff
  {
    const staffView = await AD.rpc("list_document_workspace_paginated", { _tab: "todos", _page_size: 5 });
    assert("10. staff continua com a visão consolidada (workspace)", !staffView.error, staffView.error);
    const staffPend = await pend(AD);
    assert("10b. staff sem vínculo de cliente não recebe pendências de cliente",
      (staffPend.data?.rows ?? []).length === 0, staffPend.data?.rows?.length);
  }

  // 7 / estáticos — navegação e fonte de dados
  {
    const page = readFileSync("src/routes/_authenticated/minhas-pendencias.tsx", "utf8");
    const hook = readFileSync("src/hooks/documentos/use-client-pendings.ts", "utf8");
    const docs = readFileSync("src/routes/_authenticated/meus-documentos.tsx", "utf8");
    const sheet = readFileSync("src/components/documentos/portal/PortalDetailSheet.tsx", "utf8");

    assert("7. página linka para /meus-documentos preservando empresa e item",
      /to="\/meus-documentos"/.test(page) && /client: r\.client_id/.test(page) && /item: r\.item_id/.test(page));
    assert("7b. /meus-documentos aceita o parâmetro item e abre o detalhe",
      /item: str\("item"\)/.test(docs) && /deepLinkItem/.test(docs));
    assert("fonte de dados usa apenas a RPC consolidada",
      /client_list_pending_actions/.test(hook) && !/from\("document_requests"\)/.test(page) && !/from\("tax_guides"\)/.test(page));
    assert("upload invalida o cache de pendências do cliente", /client-pendings/.test(sheet));
    assert("página não cria pending_task", !/insert\(\s*\{[^}]*pending_tasks/.test(page) && !/from\("pending_tasks"\)\s*\.insert/.test(page));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} asserções OK`);
  return failed.length;
}

let code = 1;
try {
  code = (await run()) === 0 ? 0 : 1;
} catch (e) {
  console.error("ERRO:", e.message);
} finally {
  await teardown();
}
process.exit(code);
