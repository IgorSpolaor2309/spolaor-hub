#!/usr/bin/env node
/**
 * Criação direta de solicitações na Central de Documentos.
 *
 * Cobre:
 *   1) nenhuma função de leitura (STABLE/IMMUTABLE) executa DDL;
 *   2) listagem de elegíveis carrega sem erro e respeita filtros;
 *   3) isolamento cross-empresa e carteira do colaborador;
 *   4) Real/Demo + demo_batch_id;
 *   5) criação a partir do checklist vincula o item e sai da lista;
 *   6) contadores da aba refletem a criação;
 *   7) duplicidade bloqueada por item de checklist;
 *   8) alerta (não bloqueio) de possível duplicidade;
 *   9) criação manual (sem checklist) e aparecimento em "Aguardando cliente";
 *  10) cliente não consegue chamar as RPCs de staff.
 *
 * Uso: node scripts/tests/documentos-criar-solicitacao.mjs
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_ = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SRK || !PUB) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}
const admin = createClient(URL_, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

const TAG = `crq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = {
  admin: `adm-${TAG}@test.local`,
  collab: `col-${TAG}@test.local`,
  outsider: `out-${TAG}@test.local`,
  client: `cli-${TAG}@test.local`,
};

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra !== undefined ? " — " + JSON.stringify(extra).slice(0, 400) : ""}`);
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

async function createUser(email, role) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PWD, email_confirm: true,
  });
  if (error) throw error;
  const uid = data.user.id;
  await admin.from("profiles").upsert({ id: uid, full_name: email, email, status: "active" });
  if (role) await admin.from("user_roles").upsert({ user_id: uid, role });
  return uid;
}

const created = { clients: [], users: [], collaborators: [], items: [], requests: [] };

async function cleanup() {
  for (const id of created.requests) await admin.from("document_requests").delete().eq("id", id);
  for (const id of created.items) await admin.from("client_checklist_items").delete().eq("id", id);
  for (const id of created.clients) {
    await admin.from("document_requests").delete().eq("client_id", id);
    await admin.from("client_checklist_items").delete().eq("client_id", id);
    await admin.from("client_collaborators").delete().eq("client_id", id);
    await admin.from("clients").delete().eq("id", id);
  }
  for (const id of created.collaborators) await admin.from("collaborators").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
}

async function main() {
  // ---------- 1) Guard de DDL em funções de leitura ----------
  const ddl = await sqlCatalog(`
    select p.proname, p.provolatile,
           (p.prosrc ~* '(^|[^a-z_])create\\s+(temp|temporary\\s+)?table') as has_create_table,
           (p.prosrc ~* '(^|[^a-z_])(create\\s+(temp|temporary|table|index|view|schema|sequence)|drop\\s+(table|index|view|schema|sequence)|alter\\s+table|truncate\\s)') as has_ddl
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.provolatile in ('s','i')
  `);
  const offenders = (ddl ?? []).filter((r) => r.has_create_table);
  assert("nenhuma função STABLE/IMMUTABLE executa CREATE TABLE", offenders.length === 0, offenders.map((o) => o.proname));

  const listFn = (ddl ?? []).find((r) => r.proname === "workspace_checklist_precisa_solicitar_list");
  assert("listagem de elegíveis é STABLE (somente leitura)", listFn?.provolatile === "s", listFn);
  assert("listagem de elegíveis não contém CREATE TABLE", listFn && !listFn.has_create_table, listFn);
  assert("listagem de elegíveis não contém DDL algum", listFn && !listFn.has_ddl, listFn);

  // ---------- Setup ----------
  const adminId = await createUser(E.admin, "admin");
  const collabId = await createUser(E.collab, "collaborator");
  const outsiderId = await createUser(E.outsider, "collaborator");
  const clientUserId = await createUser(E.client, "client");
  created.users.push(adminId, collabId, outsiderId, clientUserId);

  const { data: colRow } = await admin
    .from("collaborators")
    .insert({ nome: `col ${TAG}`, email: E.collab, user_id: collabId, status: "active" })
    .select("id").single();
  created.collaborators.push(colRow.id);

  const mk = async (nome, extra = {}) => {
    const { data, error } = await admin
      .from("clients")
      .insert({ razao_social: nome, status: "ativo", origem_cadastro: "manual", ...extra })
      .select("id").single();
    if (error) throw error;
    created.clients.push(data.id);
    return data.id;
  };
  const cA = await mk(`A ${TAG}`);          // carteira do colaborador
  const cB = await mk(`B ${TAG}`);          // fora da carteira
  const cDemoBatch = randomUUID();
  await admin.from("demo_batches").insert({ id: cDemoBatch, label: `batch ${TAG}`, status: "ativo" });
  const cD = await mk(`D ${TAG}`, { is_demo: true, demo_batch_id: cDemoBatch });

  await admin.from("client_collaborators").insert({ client_id: cA, collaborator_id: colRow.id });
  await admin.from("client_users").insert({ client_id: cA, user_id: clientUserId, ativo: true });

  const COMP = "2099-01";
  const mkItem = async (clientId, titulo, extra = {}) => {
    const { data, error } = await admin
      .from("client_checklist_items")
      .insert({
        client_id: clientId, titulo, categoria: "fiscal", competencia: COMP,
        status: "pendente", origem: "manual", ...extra,
      })
      .select("id").single();
    if (error) throw error;
    created.items.push(data.id);
    return data.id;
  };
  const itemA = await mkItem(cA, `item A ${TAG}`);
  const itemB = await mkItem(cB, `item B ${TAG}`);
  const itemD = await mkItem(cD, `item D ${TAG}`, { is_demo: true, demo_batch_id: cDemoBatch });
  const itemOtherComp = await mkItem(cA, `item outra comp ${TAG}`, { competencia: "2098-05" });

  const adminC = userClient(await signIn(E.admin));
  const collabC = userClient(await signIn(E.collab));
  const outsiderC = userClient(await signIn(E.outsider));
  const clientC = userClient(await signIn(E.client));

  const listAs = (c, args = {}) => c.rpc("workspace_checklist_precisa_solicitar_list", args);
  const ids = (payload) => (payload?.rows ?? []).map((r) => r.id);

  // ---------- 2) Listagem carrega ----------
  const l1 = await listAs(adminC, { _competencia: COMP, _page_size: 100 });
  assert("aba 'Precisa solicitar' carrega sem erro", !l1.error, l1.error);
  assert("item elegível aparece na lista", ids(l1.data).includes(itemA), ids(l1.data));
  assert("payload traz total/página", typeof l1.data?.total === "number" && l1.data?.page === 1, l1.data);

  const cols = Object.keys((l1.data?.rows ?? [])[0] ?? {});
  assert("retorna apenas colunas explícitas do contrato",
    cols.length > 0 && cols.every((k) => [
      "id","client_id","titulo","categoria","competencia","prazo","origem","is_demo",
      "demo_batch_id","responsavel_profile_id","responsavel_nome","observacao","created_at",
      "empresa_nome","empresa_documento",
    ].includes(k)), cols);

  // ---------- 3) Filtros ----------
  const lComp = await listAs(adminC, { _competencia: COMP, _page_size: 100 });
  assert("filtro por competência exclui outras competências", !ids(lComp.data).includes(itemOtherComp));
  const lCli = await listAs(adminC, { _client_id: cA, _page_size: 100 });
  assert("filtro por empresa retorna só a empresa pedida", ids(lCli.data).length > 0 && !ids(lCli.data).includes(itemB));
  const lSearch = await listAs(adminC, { _search: `item B ${TAG}`, _page_size: 100 });
  assert("busca textual funciona", ids(lSearch.data).includes(itemB));
  const lPage = await listAs(adminC, { _competencia: COMP, _page: 1, _page_size: 1 });
  assert("paginação server-side aplica page_size", (lPage.data?.rows ?? []).length <= 1 && lPage.data?.page_size === 1);

  // ---------- 4) Carteira / isolamento ----------
  const lCol = await listAs(collabC, { _page_size: 100 });
  assert("colaborador vê item da sua carteira", ids(lCol.data).includes(itemA));
  assert("colaborador NÃO vê item fora da carteira", !ids(lCol.data).includes(itemB));
  const lOut = await listAs(outsiderC, { _page_size: 100 });
  assert("colaborador sem carteira não vê nada dessas empresas",
    !ids(lOut.data).includes(itemA) && !ids(lOut.data).includes(itemB));

  // ---------- 5) Real/Demo ----------
  const lReal = await listAs(adminC, { _include_demo: false, _page_size: 100 });
  assert("filtro Real exclui itens demo", !ids(lReal.data).includes(itemD));
  const lDemo = await listAs(adminC, { _include_demo: true, _page_size: 100 });
  assert("filtro Todos inclui itens demo", ids(lDemo.data).includes(itemD));
  const demoRow = (lDemo.data?.rows ?? []).find((r) => r.id === itemD);
  assert("item demo carrega demo_batch_id", demoRow?.demo_batch_id === cDemoBatch, demoRow);

  // ---------- 6) Cliente não acessa RPCs de staff ----------
  const cliList = await listAs(clientC, {});
  assert("cliente é bloqueado na listagem de elegíveis", !!cliList.error, cliList.data);
  const cliCreate = await clientC.rpc("staff_create_document_request", { _client_id: cA, _titulo: "hack" });
  assert("cliente é bloqueado na criação de solicitação", !!cliCreate.error, cliCreate.data);
  const cliDup = await clientC.rpc("staff_check_duplicate_document_request", { _client_id: cA });
  assert("cliente é bloqueado na checagem de duplicidade", !!cliDup.error, cliDup.data);

  // ---------- 7) Contadores antes ----------
  const before = await adminC.rpc("workspace_checklist_precisa_solicitar_count", { _include_demo: true });
  assert("contadores da aba carregam", !before.error, before.error);

  // ---------- 8) Criação a partir do checklist ----------
  const createRes = await collabC.rpc("staff_create_document_request", {
    _client_id: cA,
    _titulo: `Solicitação ${TAG}`,
    _descricao: "Envie o documento",
    _competencia: COMP,
    _categoria: "fiscal",
    _tipo_solicitacao: "balancete",
    _departamento: "fiscal",
    _urgencia: "normal",
    _checklist_item_id: itemA,
  });
  assert("criação a partir do checklist funciona", !createRes.error, createRes.error);
  const reqId = createRes.data?.id;
  if (reqId) created.requests.push(reqId);
  assert("solicitação nasce com status aguardando", createRes.data?.status === "aguardando", createRes.data);
  assert("solicitação retorna vínculo com o item", createRes.data?.checklist_item_id === itemA);

  const { data: linked } = await admin
    .from("client_checklist_items").select("document_request_id").eq("id", itemA).single();
  assert("item de checklist é vinculado à solicitação", linked?.document_request_id === reqId, linked);

  const l2 = await listAs(adminC, { _competencia: COMP, _page_size: 100 });
  assert("item sai da lista de elegíveis após criar", !ids(l2.data).includes(itemA));

  const after = await adminC.rpc("workspace_checklist_precisa_solicitar_count", { _include_demo: true });
  assert("contador 'Já com solicitação ativa' aumenta",
    (after.data?.ja_com_request_ativo ?? 0) > (before.data?.ja_com_request_ativo ?? 0),
    { before: before.data, after: after.data });
  assert("contador de elegíveis diminui",
    (after.data?.elegiveis ?? 0) < (before.data?.elegiveis ?? 0), { before: before.data, after: after.data });

  // ---------- 9) Aparece em "Aguardando cliente" ----------
  const ws = await collabC.rpc("list_document_workspace_paginated", {
    _tab: "aguardando_cliente", _client_id: cA, _page: 1, _page_size: 100,
  });
  assert("solicitação aparece em 'Aguardando cliente'",
    (ws.data?.rows ?? []).some((r) => r.item_id === reqId), ws.error ?? (ws.data?.rows ?? []).length);

  // ---------- 10) Duplicidade ----------
  const dupCreate = await collabC.rpc("staff_create_document_request", {
    _client_id: cA, _titulo: `Duplicada ${TAG}`, _checklist_item_id: itemA,
  });
  assert("duplicidade por item de checklist é bloqueada", !!dupCreate.error, dupCreate.data);

  const dupCheck = await collabC.rpc("staff_check_duplicate_document_request", {
    _client_id: cA, _competencia: COMP, _categoria: "fiscal", _tipo: "balancete",
  });
  assert("checagem de duplicidade retorna alerta (não bloqueia)",
    !dupCheck.error && (dupCheck.data?.possiveis_duplicatas ?? []).some((d) => d.id === reqId), dupCheck);

  // ---------- 11) Criação manual (Nova solicitação) ----------
  const manual = await collabC.rpc("staff_create_document_request", {
    _client_id: cA, _titulo: `Manual ${TAG}`, _urgencia: "urgente",
  });
  assert("botão 'Nova solicitação' (criação manual) funciona", !manual.error, manual.error);
  if (manual.data?.id) created.requests.push(manual.data.id);
  assert("criação manual não exige checklist", manual.data?.checklist_item_id == null, manual.data);

  // ---------- 12) Cross-empresa / demo ----------
  const cross = await collabC.rpc("staff_create_document_request", { _client_id: cB, _titulo: "x" });
  assert("colaborador não cria solicitação fora da carteira", !!cross.error, { cA, cB, got: cross.data?.client_id, err: cross.error?.message });
  const crossItem = await adminC.rpc("staff_create_document_request", {
    _client_id: cA, _titulo: "x", _checklist_item_id: itemB,
  });
  assert("item de checklist de outra empresa é recusado", !!crossItem.error, crossItem.data);
  const mixDemo = await adminC.rpc("staff_create_document_request", {
    _client_id: cA, _titulo: "x", _checklist_item_id: itemD,
  });
  assert("mistura real/demo é recusada", !!mixDemo.error, mixDemo.data);
  const demoReq = await adminC.rpc("staff_create_document_request", {
    _client_id: cD, _titulo: `Demo ${TAG}`, _checklist_item_id: itemD,
  });
  assert("solicitação em empresa demo herda is_demo", !demoReq.error && demoReq.data?.is_demo === true, demoReq.error ?? demoReq.data);
  if (demoReq.data?.id) created.requests.push(demoReq.data.id);

  const badUrg = await adminC.rpc("staff_create_document_request", {
    _client_id: cA, _titulo: "x", _urgencia: "nuclear",
  });
  assert("urgência inválida é recusada", !!badUrg.error);
  const noTitle = await adminC.rpc("staff_create_document_request", { _client_id: cA, _titulo: "   " });
  assert("título vazio é recusado", !!noTitle.error);
}

/** Executa SQL de catálogo via função utilitária temporária (service role). */
async function sqlCatalog(sql) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const res = await c.query(sql);
    return res.rows;
  } finally {
    await c.end();
  }
}

main()
  .catch((e) => { console.error("💥", e); results.push({ name: "execução", ok: false }); })
  .finally(async () => {
    await cleanup().catch(() => {});
    const ok = results.filter((r) => r.ok).length;
    console.log(`\n${ok}/${results.length} asserções OK`);
    process.exit(ok === results.length ? 0 : 1);
  });
