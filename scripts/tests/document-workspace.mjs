#!/usr/bin/env node
/**
 * Integração autenticada — Central de Documentos + Solicitações (Fase 3).
 *
 * Cria três usuários reais via Admin API (admin, colaborador com carteira,
 * cliente ligado a uma das empresas), popula duas empresas ("A" com carteira
 * do colaborador e cliente, "B" isolada), gera solicitações em cada status
 * unificado e documentos avulsos com/sem validade, e valida contra as RPCs
 * `list_document_workspace_paginated` (staff, SECURITY INVOKER) e
 * `list_client_document_workspace_paginated` (portal, SECURITY DEFINER).
 *
 * Uso:
 *   node scripts/tests/document-workspace.mjs
 *
 * Requisitos de env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const URL_ = process.env.SUPABASE_URL;
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUB  = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !SRK || !PUB) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY.");
  process.exit(2);
}
const admin = createClient(URL_, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

const TAG = `docws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E   = {
  admin:  `admin-${TAG}@test.local`,
  collab: `cw-${TAG}@test.local`,
  client: `cli-${TAG}@test.local`,
};

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok, extra: ok ? undefined : extra });
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? " — " + JSON.stringify(extra).slice(0, 300) : ""}`);
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
const userClient = (tok) => createClient(URL_, PUB, {
  global: { headers: { Authorization: `Bearer ${tok}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });

const created = { users: [], clients: [], docs: [], reqs: [], collab: null, cu: null, links: [] };

async function createUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PWD, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  created.users.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, email, full_name: email, status: "active" });
  return data.user.id;
}
async function grantRole(uid, role) {
  const { error } = await admin.from("user_roles").insert({ user_id: uid, role });
  if (error && !/duplicate/i.test(error.message)) throw new Error(`grantRole ${role}: ${error.message}`);
}
async function iso(daysFromNow) {
  const d = new Date(); d.setDate(d.getDate() + daysFromNow); return d.toISOString().slice(0, 10);
}

async function setup() {
  const adminId  = await createUser(E.admin);
  const collabId = await createUser(E.collab);
  const clientId = await createUser(E.client);
  await grantRole(adminId, "admin");
  await grantRole(collabId, "collaborator");
  await grantRole(clientId, "client");

  const { data: coll, error: ec } = await admin.from("collaborators").insert({
    user_id: collabId, nome: `cw-${TAG}`, email: `${TAG}-cw@test.local`, status: "active",
  }).select("id").single();
  if (ec) throw new Error(`collab: ${ec.message}`);
  created.collab = coll.id;

  const { data: cA } = await admin.from("clients").insert({
    razao_social: `WS-A-${TAG}`, documento: `${Date.now()}A`.slice(-14).padStart(14, "1"), status: "active",
  }).select("id").single();
  const { data: cB } = await admin.from("clients").insert({
    razao_social: `WS-B-${TAG}`, documento: `${Date.now()}B`.slice(-14).padStart(14, "2"), status: "active",
  }).select("id").single();
  created.clients.push(cA.id, cB.id);

  await admin.from("client_collaborators").insert({ client_id: cA.id, collaborator_id: coll.id });
  const { data: cu } = await admin.from("client_users").insert({
    client_id: cA.id, user_id: clientId, papel: "titular", ativo: true,
  }).select("id").single();
  created.cu = cu.id;

  // Documentos avulsos na empresa A: um sem validade, um vencendo, um vencido, um válido longe
  const docs = [];
  for (const [nome, validade] of [
    [`doc-plain-${TAG}`, null],
    [`doc-vencendo-${TAG}`, await iso(15)],
    [`doc-vencido-${TAG}`, await iso(-3)],
    [`doc-longe-${TAG}`, await iso(365)],
  ]) {
    const { data, error } = await admin.from("documents").insert({
      client_id: cA.id, nome, tipo: "outros", status: "aprovado",
      storage_path: `test/${TAG}/${nome}.pdf`, data_validade: validade, uploaded_by: adminId,
    }).select("id").single();
    if (error) throw new Error(`doc ${nome}: ${error.message}`);
    docs.push(data.id);
  }
  created.docs.push(...docs);

  // Solicitações na empresa A: cada status oficial + criador variando
  const reqs = {};
  for (const [key, patch] of Object.entries({
    aguardando_do_client:  { status: "aguardando", criado_por: clientId, criado_por_role: "client",  titulo: `req-agC-${TAG}` },
    aguardando_do_staff:   { status: "aguardando", criado_por: adminId,  criado_por_role: "staff",   titulo: `req-agS-${TAG}` },
    recebido:              { status: "recebido",   criado_por: adminId,  criado_por_role: "staff",   titulo: `req-rc-${TAG}` },
    reenviar:              { status: "reenviar",   criado_por: adminId,  criado_por_role: "staff",   titulo: `req-re-${TAG}` },
    concluido:             { status: "concluido",  criado_por: adminId,  criado_por_role: "staff",   titulo: `req-cc-${TAG}` },
    cancelado:             { status: "cancelado",  criado_por: adminId,  criado_por_role: "staff",   titulo: `req-cx-${TAG}` },
    legado_null_role:      { status: "aguardando", criado_por: adminId,  criado_por_role: null,      titulo: `req-lg-${TAG}` },
  })) {
    const { data, error } = await admin.from("document_requests").insert({
      client_id: cA.id, prazo: await iso(7), urgencia: "normal",
      observacoes_internas: `TOP-SECRET-${TAG}`, ...patch,
    }).select("id").single();
    if (error) throw new Error(`req ${key}: ${error.message}`);
    reqs[key] = data.id;
    created.reqs.push(data.id);
  }

  // Uma solicitação isolada na empresa B (para vazamento cross-empresa)
  const { data: rB } = await admin.from("document_requests").insert({
    client_id: cB.id, titulo: `req-B-${TAG}`, status: "aguardando", urgencia: "normal",
    criado_por: adminId, criado_por_role: "staff", observacoes_internas: `LEAK-${TAG}`,
  }).select("id").single();
  created.reqs.push(rB.id);

  return { adminId, collabId, clientId, cA: cA.id, cB: cB.id, docs, reqs, rB: rB.id };
}

async function teardown() {
  if (created.reqs.length) await admin.from("document_requests").delete().in("id", created.reqs);
  if (created.docs.length) await admin.from("documents").delete().in("id", created.docs);
  if (created.clients.length) await admin.from("clients").delete().in("id", created.clients);
  if (created.collab) await admin.from("collaborators").delete().eq("id", created.collab);
  for (const uid of created.users) { try { await admin.auth.admin.deleteUser(uid); } catch {} }
}

const rpcStaff = (cli, params = {}) => cli.rpc("list_document_workspace_paginated", {
  _tab: "todos", _search: null, _client_id: null, _competencia: null, _categoria: null,
  _tipo: null, _departamento: null, _status: null, _action_owner: null, _responsavel_id: null,
  _origem: null, _prazo_from: null, _prazo_to: null, _validade_from: null, _validade_to: null,
  _tem_documento: null, _tem_vinculo: null, _somente_meus: false,
  _include_demo: true, _demo_batch_id: null, _page: 1, _page_size: 100, ...params,
});
const rpcClient = (cli, params = {}) => cli.rpc("list_client_document_workspace_paginated", {
  _client_id: null, _section: "historico", _search: null, _competencia: null,
  _page: 1, _page_size: 100, ...params,
});

async function run() {
  const ctx = await setup();
  const A = userClient(await signIn(E.admin));
  const CW = userClient(await signIn(E.collab));
  const CL = userClient(await signIn(E.client));

  // ─── 1. Segurança / grants ────────────────────────────────────────────────
  {
    const { error } = await anon.rpc("list_document_workspace_paginated", { _tab: "todos" });
    assert("anon NÃO executa list_document_workspace_paginated", !!error, error);
  }
  {
    const { error } = await anon.rpc("list_client_document_workspace_paginated", { _section: "historico" });
    assert("anon NÃO executa list_client_document_workspace_paginated", !!error, error);
  }
  {
    const { data, error } = await CL.rpc("list_document_workspace_paginated", { _tab: "todos" });
    assert("cliente NÃO executa RPC de staff", !!error || !data, { error, data });
  }
  {
    const { data, error } = await A.rpc("list_client_document_workspace_paginated", { _section: "historico" });
    // Admin não tem client_users → resultado vazio (não é erro)
    assert("admin sem vínculo em client_users retorna vazio na RPC do cliente",
      !error && Array.isArray(data?.rows) && data.rows.length === 0, { error, rows: data?.rows?.length });
  }

  // ─── 2. Retorno staff base ───────────────────────────────────────────────
  const { data: staffAll, error: eSA } = await rpcStaff(A);
  assert("admin executa RPC staff sem erro", !eSA, eSA);
  assert("payload tem { rows, counts, page, total }",
    staffAll && Array.isArray(staffAll.rows) && staffAll.counts && "total" in staffAll, staffAll && Object.keys(staffAll));

  const ourRows = (staffAll?.rows || []).filter(r =>
    (created.reqs.includes(r.item_id) || created.docs.includes(r.item_id))
  );
  assert("admin vê nossas 7 solicitações + 4 documentos avulsos = 11 linhas (empresa A) + 1 (empresa B) = 12",
    ourRows.length === 12, ourRows.length);

  // ─── 3. Colunas obrigatórias e omissão de observacoes_internas ───────────
  {
    const sample = ourRows[0] || {};
    const expected = ["item_id","item_kind","client_id","empresa_nome","titulo","status","status_label",
      "action_owner","prazo","data_validade","has_document","has_process_link","links_count",
      "is_expiring","is_expired","is_demo","created_at","updated_at"];
    const missing = expected.filter(k => !(k in sample));
    assert("linha staff contém todos os campos do contrato", missing.length === 0, missing);
  }
  {
    const leaked = JSON.stringify(staffAll?.rows || []).includes("TOP-SECRET-");
    assert("observacoes_internas NÃO vaza na RPC staff", !leaked);
  }

  // ─── 4. Cross-empresa (colaborador sem carteira em B) ────────────────────
  const { data: cwAll } = await rpcStaff(CW);
  {
    const seenB = (cwAll?.rows || []).some(r => r.item_id === ctx.rB);
    assert("colaborador SEM carteira em B não vê solicitação de B", !seenB);
  }
  {
    const seenA = (cwAll?.rows || []).filter(r =>
      created.reqs.includes(r.item_id) || created.docs.includes(r.item_id));
    assert("colaborador COM carteira em A vê as 11 linhas da empresa A", seenA.length === 11, seenA.length);
  }

  // ─── 5. action_owner ─────────────────────────────────────────────────────
  const byId = new Map((staffAll?.rows || []).map(r => [r.item_id, r]));
  {
    const r = byId.get(ctx.reqs.aguardando_do_client);
    assert("aguardando criada pelo cliente → action_owner=staff",
      r?.status === "aguardando" && r?.action_owner === "staff", r);
  }
  {
    const r = byId.get(ctx.reqs.aguardando_do_staff);
    assert("aguardando criada pelo staff → action_owner=client",
      r?.status === "aguardando" && r?.action_owner === "client", r);
  }
  {
    const r = byId.get(ctx.reqs.recebido);
    assert("recebido → action_owner=staff", r?.action_owner === "staff", r);
  }
  {
    const r = byId.get(ctx.reqs.reenviar);
    assert("reenviar → action_owner=client", r?.action_owner === "client", r);
  }
  {
    const r = byId.get(ctx.reqs.concluido);
    assert("concluido → action_owner=none", r?.action_owner === "none", r);
  }
  {
    const r = byId.get(ctx.reqs.cancelado);
    assert("cancelado → action_owner=none", r?.action_owner === "none", r);
  }
  {
    const r = byId.get(ctx.reqs.legado_null_role);
    assert("aguardando com criado_por_role NULL (criador=admin) → action_owner=client (fallback)",
      r?.action_owner === "client", r);
  }
  {
    const doc = byId.get(ctx.docs[0]);
    assert("documento avulso → action_owner=none", doc?.action_owner === "none", doc);
  }

  // ─── 6. Labels ───────────────────────────────────────────────────────────
  {
    const map = new Map((staffAll?.rows || []).map(r => [r.item_id, r.status_label]));
    assert("label 'Aguardando'", map.get(ctx.reqs.aguardando_do_client) === "Aguardando");
    assert("label 'Recebido'",   map.get(ctx.reqs.recebido) === "Recebido");
    assert("label 'Reenviar'",   map.get(ctx.reqs.reenviar) === "Reenviar");
    assert("label 'Concluído'",  map.get(ctx.reqs.concluido) === "Concluído");
    assert("label 'Cancelado'",  map.get(ctx.reqs.cancelado) === "Cancelado");
    assert("label 'Vencido' em doc com validade passada",
      map.get(ctx.docs[2]) === "Vencido");
    assert("label 'Vencendo' em doc com validade em ~15 dias",
      map.get(ctx.docs[1]) === "Vencendo");
    assert("label 'Arquivado' em doc sem validade",
      map.get(ctx.docs[0]) === "Arquivado");
  }

  // ─── 7. Abas ─────────────────────────────────────────────────────────────
  {
    const { data } = await rpcStaff(A, { _tab: "aguardando_cliente", _client_id: ctx.cA });
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("aba aguardando_cliente inclui req criada pelo staff (action_owner=client)",
      ids.has(ctx.reqs.aguardando_do_staff));
    assert("aba aguardando_cliente NÃO inclui req criada pelo cliente (owner=staff)",
      !ids.has(ctx.reqs.aguardando_do_client));
    assert("aba aguardando_cliente NÃO inclui recebido",
      !ids.has(ctx.reqs.recebido));
  }
  {
    const { data } = await rpcStaff(A, { _tab: "recebidos", _client_id: ctx.cA });
    const ids = (data.rows || []).map(r => r.item_id);
    assert("aba recebidos contém exatamente 1 item da nossa empresa A",
      ids.filter(x => created.reqs.includes(x)).length === 1 && ids.includes(ctx.reqs.recebido));
  }
  {
    const { data } = await rpcStaff(A, { _tab: "reenviar", _client_id: ctx.cA });
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("aba reenviar retorna a req 'reenviar'", ids.has(ctx.reqs.reenviar));
  }
  {
    const { data } = await rpcStaff(A, { _tab: "concluidos", _client_id: ctx.cA });
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("aba concluidos retorna a req 'concluido'", ids.has(ctx.reqs.concluido));
    assert("aba concluidos NÃO inclui documento avulso",
      !ctx.docs.some(d => ids.has(d)));
  }
  {
    const { data } = await rpcStaff(A, { _tab: "vencidos", _client_id: ctx.cA });
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("aba vencidos inclui doc[2] (validade passada)", ids.has(ctx.docs[2]));
    assert("aba vencidos NÃO inclui doc[3] (validade longe)", !ids.has(ctx.docs[3]));
  }
  {
    const { data } = await rpcStaff(A, { _tab: "vencendo", _client_id: ctx.cA });
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("aba vencendo inclui doc[1] (validade em 15d)", ids.has(ctx.docs[1]));
    assert("aba vencendo NÃO inclui doc[2] (já vencido)", !ids.has(ctx.docs[2]));
  }
  {
    const { data } = await rpcStaff(A, { _tab: "vinculados", _client_id: ctx.cA });
    // Sem vínculos criados nos fixtures → esperado 0 linhas nossas
    const ours = (data.rows || []).filter(r =>
      created.reqs.includes(r.item_id) || created.docs.includes(r.item_id));
    assert("aba vinculados vazia sem process links", ours.length === 0, ours.length);
  }

  // ─── 8. Filtros server-side ──────────────────────────────────────────────
  {
    const { data } = await rpcStaff(A, { _search: `req-rc-${TAG}` });
    const ours = (data.rows || []).filter(r => created.reqs.includes(r.item_id));
    assert("filtro _search bate no título único", ours.length === 1 && ours[0].item_id === ctx.reqs.recebido);
  }
  {
    const { data } = await rpcStaff(A, { _origem: "document_avulso", _client_id: ctx.cA });
    const ours = (data.rows || []).filter(r => created.docs.includes(r.item_id) || created.reqs.includes(r.item_id));
    const kinds = new Set(ours.map(r => r.item_kind));
    assert("filtro _origem=document_avulso só retorna item_kind=document",
      ours.length === 4 && kinds.size === 1 && kinds.has("document"), { total: ours.length, kinds: [...kinds] });
  }
  {
    const { data } = await rpcStaff(A, { _status: "concluido", _client_id: ctx.cA });
    const ours = (data.rows || []).filter(r => created.reqs.includes(r.item_id));
    assert("filtro _status=concluido retorna apenas a req concluido",
      ours.length === 1 && ours[0].item_id === ctx.reqs.concluido);
  }
  {
    const { data } = await rpcStaff(A, { _tem_documento: false, _client_id: ctx.cA });
    const ours = (data.rows || []).filter(r => created.reqs.includes(r.item_id) || created.docs.includes(r.item_id));
    assert("_tem_documento=false só retorna requests sem document_id",
      ours.every(r => !r.has_document), ours.map(r => ({ id: r.item_id, has: r.has_document })));
  }
  {
    const { data } = await rpcStaff(A, { _client_id: ctx.cA });
    const seenB = (data.rows || []).some(r => r.client_id === ctx.cB);
    assert("_client_id filtra empresa (nenhuma linha de B ao pedir A)", !seenB);
  }

  // ─── 9. Paginação e counts ───────────────────────────────────────────────
  {
    const { data } = await rpcStaff(A, { _page_size: 2, _client_id: ctx.cA });
    assert("_page_size=2 retorna no máx 2 linhas", (data.rows || []).length <= 2, data?.rows?.length);
    assert("total reflete todas as linhas da empresa A (>= 11)", (data.total ?? 0) >= 11, data?.total);
  }
  {
    const { data } = await rpcStaff(A, { _page_size: 200, _client_id: ctx.cA });
    // 200 > máx 100 → deve capar em 100
    assert("_page_size é capado em 100", (data.rows || []).length <= 100);
  }
  {
    const { data } = await rpcStaff(A, { _page: 999, _client_id: ctx.cA });
    assert("página fora do intervalo retorna rows vazio + total intacto",
      (data.rows || []).length === 0 && (data.total ?? 0) > 0, data);
  }
  {
    const { data } = await rpcStaff(A, { _client_id: ctx.cA });
    const c = data.counts || {};
    const keys = ["aguardando_cliente","aguardando_equipe","recebidos","reenviar","concluidos","vencendo","vencidos","vinculados","todos"];
    const missing = keys.filter(k => !(k in c));
    assert("counts contém todas as chaves esperadas", missing.length === 0, missing);
    assert("counts.recebidos >= 1", (c.recebidos ?? 0) >= 1, c);
    assert("counts.vencidos >= 1", (c.vencidos ?? 0) >= 1, c);
    assert("counts.todos coincide com total", c.todos === data.total, { todos: c.todos, total: data.total });
  }

  // ─── 10. Ordenação determinística ────────────────────────────────────────
  {
    const { data: a } = await rpcStaff(A, { _client_id: ctx.cA, _page_size: 50 });
    const { data: b } = await rpcStaff(A, { _client_id: ctx.cA, _page_size: 50 });
    const ordA = (a.rows || []).map(r => r.item_id).join(",");
    const ordB = (b.rows || []).map(r => r.item_id).join(",");
    assert("ordenação estável entre duas chamadas iguais", ordA === ordB);
  }

  // ─── 11. Portal do cliente ───────────────────────────────────────────────
  {
    const { data, error } = await rpcClient(CL, { _section: "precisa_enviar" });
    assert("cliente executa RPC do portal sem erro", !error, error);
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("precisa_enviar inclui req com action_owner=client (aguardando criada pelo staff)",
      ids.has(ctx.reqs.aguardando_do_staff));
    assert("precisa_enviar inclui req 'reenviar'", ids.has(ctx.reqs.reenviar));
    assert("precisa_enviar NÃO inclui req da empresa B", !ids.has(ctx.rB));
  }
  {
    const { data } = await rpcClient(CL, { _section: "historico" });
    const ids = new Set((data.rows || []).map(r => r.item_id));
    assert("historico inclui req 'concluido'", ids.has(ctx.reqs.concluido));
    assert("historico inclui req 'recebido' (em análise)", ids.has(ctx.reqs.recebido));
  }
  {
    const { data } = await rpcClient(CL, { _section: "historico" });
    const payload = JSON.stringify(data);
    assert("portal NÃO expõe observacoes_internas", !payload.includes("TOP-SECRET-"));
    assert("portal NÃO expõe document_storage_path", !payload.includes("document_storage_path"));
    assert("portal NÃO expõe responsavel_id",
      !(data.rows || []).some(r => "responsavel_id" in r));
    assert("portal NÃO expõe demo_batch_id",
      !(data.rows || []).some(r => "demo_batch_id" in r));
    const sampleClient = (data.rows || [])[0];
    if (sampleClient) {
      assert("portal usa labels de cliente (não staff)",
        !["Aguardando","Recebido"].includes(sampleClient.status_label) ||
         ["Aguardando você","Aguardando a contabilidade","Em análise pela contabilidade","Precisa reenviar","Concluído","Cancelado"].includes(sampleClient.status_label),
        sampleClient);
    }
  }
  {
    // Cross-empresa: cliente forçando _client_id da empresa B
    const { data } = await rpcClient(CL, { _client_id: ctx.cB, _section: "historico" });
    assert("cliente NÃO consegue puxar dados forçando client_id de outra empresa",
      (data.rows || []).length === 0, data?.rows?.length);
  }

  // ─── 12. Diagnóstico checklist ───────────────────────────────────────────
  {
    const { data, error } = await A.rpc("workspace_checklist_precisa_solicitar_count",
      { _client_id: null, _include_demo: true });
    assert("diagnóstico checklist executa sem erro", !error, error);
    const keys = ["elegiveis","ja_com_request_ativo","ja_com_documento","criterio"];
    const missing = keys.filter(k => !(k in (data || {})));
    assert("diagnóstico retorna { elegiveis, ja_com_request_ativo, ja_com_documento, criterio }",
      missing.length === 0, missing);
  }

  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} asserções passaram.`);
  if (fails.length) {
    console.log("Falhas:", fails.map(f => f.name));
    process.exitCode = 1;
  }
}

try { await run(); } finally { await teardown(); }
