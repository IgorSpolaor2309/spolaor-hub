#!/usr/bin/env node
/**
 * Integração autenticada — RLS e comportamento do módulo Processos.
 *
 * Cria usuários reais via Admin API (admin, colaborador-com-vínculo,
 * colaborador-sem-vínculo), assina cada um pelo endpoint de senha, e usa os
 * JWTs contra o PostgREST/RPC para validar:
 *
 *   - visibilidade em company_processes por papel;
 *   - visibilidade em company_process_steps por papel;
 *   - visibilidade em company_process_step_requirements por papel;
 *   - filtro explícito por client_collaborators (colaborador com vínculo vê só A);
 *   - RPCs SECURITY DEFINER executáveis pelos papéis autorizados;
 *   - RPCs bloqueadas para anon (chave publishable sem JWT);
 *   - RPC de manutenção (processos_notificar_vencimentos) bloqueada para authenticated.
 *
 * Limpeza: apaga clientes (cascata) e usuários criados. Reexecutável.
 *
 * Uso:
 *   node scripts/tests/processos-rls-integration.mjs
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

const TAG    = `procrls-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD    = `Test!${randomUUID().slice(0, 8)}A9`;
const EMAILS = {
  admin:      `admin-${TAG}@test.local`,
  collabWith: `cw-${TAG}@test.local`,
  collabSem:  `cs-${TAG}@test.local`,
};

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok, extra: ok ? undefined : extra });
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? " — " + JSON.stringify(extra) : ""}`);
}

async function signInPassword(email, password) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PUB },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`signIn ${email}: ${JSON.stringify(j)}`);
  return j.access_token;
}

// Cliente REST/Query autenticado como um usuário específico (envia apenas
// apikey publishable + Authorization Bearer — mesmo padrão do frontend/MCP).
function userClient(accessToken) {
  return createClient(URL_, PUB, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const anonClient = createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });

// ─── FIXTURES ────────────────────────────────────────────────────────────────
const created = { users: [], clients: [], processes: [], ptype: null };

async function createUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PWD, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  created.users.push(data.user.id);
  // profile row
  await admin.from("profiles").upsert({ id: data.user.id, email, full_name: email, status: "active" });
  return data.user.id;
}
async function grantRole(userId, role) {
  const { error } = await admin.from("user_roles").insert({ user_id: userId, role });
  if (error && !/duplicate/i.test(error.message)) throw new Error(`grantRole ${role}: ${error.message}`);
}
async function ensureCollaboratorRow(userId, nome) {
  const { data, error } = await admin.from("collaborators").insert({
    user_id: userId, nome, email: `${TAG}-${nome}@test.local`, status: "active",
  }).select("id").single();
  if (error) throw new Error(`collab row: ${error.message}`);
  return data.id;
}

async function setup() {
  const adminId  = await createUser(EMAILS.admin);
  const cwId     = await createUser(EMAILS.collabWith);
  const csId     = await createUser(EMAILS.collabSem);
  await grantRole(adminId, "admin");
  await grantRole(cwId, "collaborator");
  await grantRole(csId, "collaborator");
  const cwCollabId = await ensureCollaboratorRow(cwId, `cw-${TAG}`);
  await ensureCollaboratorRow(csId, `cs-${TAG}`);

  const { data: cA, error: eA } = await admin.from("clients").insert({
    razao_social: `RLS-A-${TAG}`, documento: `${Date.now()}A`.slice(-14).padStart(14, "1"), status: "active",
  }).select("id").single();
  if (eA) throw new Error(`client A: ${eA.message}`);
  const { data: cB, error: eB } = await admin.from("clients").insert({
    razao_social: `RLS-B-${TAG}`, documento: `${Date.now()}B`.slice(-14).padStart(14, "2"), status: "active",
  }).select("id").single();
  if (eB) throw new Error(`client B: ${eB.message}`);
  created.clients.push(cA.id, cB.id);

  // Vincula colaborador COM ao cliente A
  const { error: eL } = await admin.from("client_collaborators").insert({
    client_id: cA.id, collaborator_id: cwCollabId,
  });
  if (eL) throw new Error(`link: ${eL.message}`);

  // Tipo de processo real (não-demo) para os processos
  const { data: pt, error: ePt } = await admin.from("process_types").insert({
    nome: `RLS-Type-${TAG}`, categoria: "test", status: "ativo",
  }).select("id").single();
  if (ePt) throw new Error(`ptype: ${ePt.message}`);
  created.ptype = pt.id;

  // Um processo por cliente
  const { data: pA, error: ePa } = await admin.from("company_processes").insert({
    client_id: cA.id, process_type_id: pt.id, status: "em_andamento", prioridade: "media",
  }).select("id").single();
  if (ePa) throw new Error(`process A: ${ePa.message}`);
  const { data: pB, error: ePb } = await admin.from("company_processes").insert({
    client_id: cB.id, process_type_id: pt.id, status: "em_andamento", prioridade: "media",
  }).select("id").single();
  if (ePb) throw new Error(`process B: ${ePb.message}`);
  created.processes.push(pA.id, pB.id);

  // Uma etapa + um requisito por processo
  const { data: sA } = await admin.from("company_process_steps")
    .insert({ company_process_id: pA.id, nome: `EtapaA-${TAG}`, ordem: 1 }).select("id").single();
  const { data: sB } = await admin.from("company_process_steps")
    .insert({ company_process_id: pB.id, nome: `EtapaB-${TAG}`, ordem: 1 }).select("id").single();
  await admin.from("company_process_step_requirements").insert([
    { company_process_step_id: sA.id, nome: `ReqA-${TAG}`, ordem: 1 },
    { company_process_step_id: sB.id, nome: `ReqB-${TAG}`, ordem: 1 },
  ]);

  return {
    adminId, cwId, csId, cA: cA.id, cB: cB.id, pA: pA.id, pB: pB.id,
    sA: sA.id, sB: sB.id,
  };
}

async function teardown() {
  // Cliente cascata deleta processes → steps → requirements
  if (created.clients.length) await admin.from("clients").delete().in("id", created.clients);
  if (created.ptype)          await admin.from("process_types").delete().eq("id", created.ptype);
  // user_roles/profiles removidos junto com o usuário via cascade nas FKs
  for (const uid of created.users) {
    try { await admin.auth.admin.deleteUser(uid); } catch {/* ignore */}
  }
}

// ─── ASSERTIONS ──────────────────────────────────────────────────────────────
async function run() {
  const ctx = await setup();

  const adminTok = await signInPassword(EMAILS.admin, PWD);
  const cwTok    = await signInPassword(EMAILS.collabWith, PWD);
  const csTok    = await signInPassword(EMAILS.collabSem, PWD);
  const A = userClient(adminTok), CW = userClient(cwTok), CS = userClient(csTok);

  // 1) SELECT direto em company_processes (nossos 2 processos)
  {
    const { data } = await A.from("company_processes").select("id").in("id", [ctx.pA, ctx.pB]);
    assert("admin vê 2 processos (A e B)", (data ?? []).length === 2, data);
  }
  {
    const { data } = await CW.from("company_processes").select("id").in("id", [ctx.pA, ctx.pB]);
    const ids = (data ?? []).map((r) => r.id);
    assert("colaborador vinculado vê apenas o processo A", ids.length === 1 && ids[0] === ctx.pA, ids);
  }
  {
    const { data } = await CS.from("company_processes").select("id").in("id", [ctx.pA, ctx.pB]);
    assert("colaborador SEM vínculo não vê nenhum processo", (data ?? []).length === 0, data);
  }

  // 2) Steps herdam via EXISTS(processes)
  {
    const { data } = await CW.from("company_process_steps").select("id").in("id", [ctx.sA, ctx.sB]);
    const ids = (data ?? []).map((r) => r.id);
    assert("colaborador vinculado vê etapa apenas de A", ids.length === 1 && ids[0] === ctx.sA, ids);
  }
  {
    const { data } = await CS.from("company_process_steps").select("id").in("id", [ctx.sA, ctx.sB]);
    assert("colaborador SEM vínculo não vê etapas", (data ?? []).length === 0, data);
  }

  // 3) Requirements herdam via steps → processes
  {
    const { data } = await CW.from("company_process_step_requirements")
      .select("id, company_process_step_id").in("company_process_step_id", [ctx.sA, ctx.sB]);
    const stepIds = (data ?? []).map((r) => r.company_process_step_id);
    assert("colaborador vinculado vê requisito apenas de etapa A", stepIds.length === 1 && stepIds[0] === ctx.sA, stepIds);
  }
  {
    const { data } = await CS.from("company_process_step_requirements")
      .select("id").in("company_process_step_id", [ctx.sA, ctx.sB]);
    assert("colaborador SEM vínculo não vê requisitos", (data ?? []).length === 0, data);
  }

  // 4) DELETE restrito a admin em company_processes (usar um id inventado; RLS deve barrar antes)
  {
    const { error } = await CW.from("company_processes").delete().eq("id", ctx.pA);
    // Delete não-permitido pela RLS: sucede como no-op (nenhuma linha afetada) mas nunca deleta.
    const { data: still } = await A.from("company_processes").select("id").eq("id", ctx.pA).maybeSingle();
    assert("colaborador NÃO consegue deletar processo (row ainda existe)", !!still && !error, { still, error });
  }

  // 5) RPCs SECURITY DEFINER — grants aplicados
  {
    const { error } = await A.rpc("admin_process_models_stats");
    assert("admin executa admin_process_models_stats", !error, error);
  }
  {
    // authenticated colaborador também pode chamar (a função contém guard interno; grant não bloqueia)
    const { error } = await CW.rpc("admin_process_models_stats");
    assert("colaborador executa admin_process_models_stats (grant authenticated)", !error, error);
  }
  {
    const { error } = await anonClient.rpc("admin_process_models_stats");
    assert("anon NÃO executa admin_process_models_stats", !!error, error);
  }
  {
    const { error } = await anonClient.rpc("open_company_process", {
      _client_id: ctx.cA, _process_type_id: ctx.ptype ?? created.ptype,
      _responsavel_id: null, _prazo_final: null, _prioridade: "media",
      _observacoes: null, _is_demo: false, _demo_batch_id: null,
    });
    assert("anon NÃO executa open_company_process", !!error, error);
  }
  {
    const { error } = await A.rpc("processos_notificar_vencimentos");
    assert("authenticated (admin) NÃO executa processos_notificar_vencimentos", !!error, error);
  }
  {
    const { error } = await anonClient.rpc("client_list_processes");
    assert("anon NÃO executa client_list_processes", !!error, error);
  }
  {
    const { data, error } = await A.rpc("client_list_processes");
    assert("admin executa client_list_processes sem erro 42702", !error, error);
    // Admin também é acesso total via is_admin → deve ver ambos os processos.
    const ids = (data ?? []).map((r) => r.id);
    assert("client_list_processes(admin) retorna A e B",
      ids.includes(ctx.pA) && ids.includes(ctx.pB), ids);
    // Contrato: RETURNS TABLE não expõe observacoes internas
    const keys = (data && data[0]) ? Object.keys(data[0]) : [];
    assert("client_list_processes não expõe observacoes",
      keys.length === 0 || !keys.includes("observacoes"), keys);
  }
  // Cliente real (client_users) vinculado ao cliente A: recebe apenas A.
  {
    const clientUserId = await createUser(`cu-${TAG}@test.local`);
    await grantRole(clientUserId, "client");
    const { error: cuErr } = await admin.from("client_users").insert({
      client_id: ctx.cA, user_id: clientUserId, ativo: true,
    });
    if (cuErr) throw new Error(`client_users link: ${cuErr.message}`);
    const clientTok = await signInPassword(`cu-${TAG}@test.local`, PWD);
    const CU = userClient(clientTok);

    const { data, error } = await CU.rpc("client_list_processes");
    assert("client_list_processes(client vinculado) sem erro", !error, error);
    const ids = (data ?? []).map((r) => r.id);
    assert("client_list_processes(client vinculado) retorna somente A",
      ids.length === 1 && ids[0] === ctx.pA, ids);

    // client não vinculado
    const otherId = await createUser(`cx-${TAG}@test.local`);
    await grantRole(otherId, "client");
    const otherTok = await signInPassword(`cx-${TAG}@test.local`, PWD);
    const CX = userClient(otherTok);
    const { data: d2, error: e2 } = await CX.rpc("client_list_processes");
    assert("client_list_processes(client sem vínculo) sem erro e vazio",
      !e2 && (d2 ?? []).length === 0, { d2, e2 });

    // Colaborador com vínculo também tem acesso ao cliente A via user_has_client_access.
    // Verificamos que a RPC responde sem erro nesse papel (comportamento esperado).
    const { data: dCW, error: eCW } = await CW.rpc("client_list_processes");
    assert("client_list_processes(colaborador vinculado) sem erro 42702", !eCW, eCW);
    const cwIds = (dCW ?? []).map((r) => r.id);
    assert("client_list_processes(colaborador vinculado) retorna somente A",
      cwIds.length === 1 && cwIds[0] === ctx.pA, cwIds);
  }
  {
    const { error } = await A.rpc("processos_indicadores");
    assert("admin executa processos_indicadores", !error, error);
  }

  // 6) Colunas sensíveis não retornam ao selecionar apenas colunas públicas de company_processes
  {
    const { data, error } = await CW.from("company_processes")
      .select("id, client_id, status, prioridade, progresso, data_abertura, prazo_final, is_demo")
      .eq("id", ctx.pA).maybeSingle();
    const keys = data ? Object.keys(data) : [];
    assert("select explícito não retorna observacoes/motivo_espera",
      !error && !keys.includes("observacoes") && !keys.includes("motivo_espera"), { keys, error });
  }

  // 7) Processo demo criado sob a mesma persona não vaza para não-admin — negativo trivial já coberto por RLS.
  //    Aqui só confirmamos que is_demo é um campo controlado e nossos processos são reais (false):
  {
    const { data } = await A.from("company_processes").select("id, is_demo").in("id", [ctx.pA, ctx.pB]);
    assert("processos de teste são reais (is_demo=false)", (data ?? []).every((r) => r.is_demo === false), data);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 8) PAGINAÇÃO — list_company_processes_paginated
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Cria 12 processos extras no cliente A com metadados uniformes (mesmo
  // prazo_final e mesmo created_at conceitual) para expor instabilidade de
  // ordenação. O desempate final é `id DESC`, portanto a paginação deve
  // ser determinística mesmo com valores idênticos no campo principal.
  const EXTRA_N = 12;
  const extraIds = [];
  {
    const rows = [];
    const uniqTag = `PAG-${TAG}`;
    for (let i = 0; i < EXTRA_N; i++) {
      rows.push({
        client_id: ctx.cA,
        process_type_id: ctx.ptype ?? created.ptype,
        status: i % 2 === 0 ? "em_andamento" : "nao_iniciado",
        prioridade: i % 3 === 0 ? "alta" : "media",
        prazo_final: "2099-12-31",
        observacoes: `${uniqTag}-${i.toString().padStart(2, "0")}`,
      });
    }
    const { data, error } = await admin.from("company_processes").insert(rows).select("id");
    if (error) throw new Error(`extra insert: ${error.message}`);
    extraIds.push(...data.map((r) => r.id));
    created.processes.push(...extraIds);
  }

  const pageAll = async (opts) => {
    // Percorre até esgotar; retorna união e metadados por página.
    const all = [];
    const totals = new Set();
    const pageSizes = new Set();
    const pageEchoes = new Set();
    let page = 1;
    for (;;) {
      const { data, error } = await A.rpc("list_company_processes_paginated", { ...opts, _page: page });
      if (error) throw new Error(`rpc page=${page}: ${error.message}`);
      totals.add(Number(data.total));
      pageSizes.add(Number(data.page_size));
      pageEchoes.add(Number(data.page));
      all.push({ page, rows: data.rows });
      if (data.rows.length < Number(data.page_size)) break;
      page++;
      if (page > 200) throw new Error("safety-break: >200 pages");
    }
    return { pages: all, totals: [...totals], pageSizes: [...pageSizes], pageEchoes: [...pageEchoes] };
  };

  // 8a) page=1 com _page_size=5, restringido ao cliente A + observacoes começa com PAG-
  {
    const { data, error } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 1, _page_size: 5, _sort_by: "abertura",
    });
    assert("paginated: rpc responde sem erro", !error, error);
    assert("paginated: page=1 retorna 5 linhas", (data?.rows ?? []).length === 5, { got: data?.rows?.length, total: data?.total });
    assert("paginated: page (echo) = 1", data?.page === 1, data);
    assert("paginated: page_size (echo) = 5", data?.page_size === 5, data);
    assert("paginated: total refletindo os 12 extras", Number(data?.total) === EXTRA_N, data);
  }

  // 8b) page=2 e page=3 — sem duplicação e cobrindo todos os 12
  {
    const p1 = await A.rpc("list_company_processes_paginated", { _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 1, _page_size: 5, _sort_by: "abertura" });
    const p2 = await A.rpc("list_company_processes_paginated", { _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 2, _page_size: 5, _sort_by: "abertura" });
    const p3 = await A.rpc("list_company_processes_paginated", { _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 3, _page_size: 5, _sort_by: "abertura" });
    const ids1 = p1.data.rows.map((r) => r.id);
    const ids2 = p2.data.rows.map((r) => r.id);
    const ids3 = p3.data.rows.map((r) => r.id);
    const union = new Set([...ids1, ...ids2, ...ids3]);
    const intersects12 = ids1.some((x) => ids2.includes(x));
    const intersects23 = ids2.some((x) => ids3.includes(x));
    assert("paginated: page=2 retorna 5 linhas seguintes", ids2.length === 5, ids2);
    assert("paginated: page=3 retorna as 2 restantes", ids3.length === 2, ids3);
    assert("paginated: sem interseção entre página 1 e 2", !intersects12, { ids1, ids2 });
    assert("paginated: sem interseção entre página 2 e 3", !intersects23, { ids2, ids3 });
    assert("paginated: união cobre exatamente os 12 registros esperados",
      union.size === EXTRA_N && extraIds.every((id) => union.has(id)),
      { unionSize: union.size, missing: extraIds.filter((id) => !union.has(id)) });
    assert("paginated: total idêntico em todas as páginas",
      p1.data.total === p2.data.total && p2.data.total === p3.data.total,
      { t1: p1.data.total, t2: p2.data.total, t3: p3.data.total });
  }

  // 8c) Determinismo com valores idênticos: repetir a mesma consulta 3x deve
  //     produzir a mesma sequência (fica evidente porque prazo_final é igual)
  {
    const seqs = [];
    for (let i = 0; i < 3; i++) {
      const { data } = await A.rpc("list_company_processes_paginated", {
        _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 1, _page_size: EXTRA_N, _sort_by: "prazo",
      });
      seqs.push(data.rows.map((r) => r.id).join("|"));
    }
    assert("paginated: ordenação determinística (id como desempate)",
      seqs[0] === seqs[1] && seqs[1] === seqs[2], seqs);
  }

  // 8d) page acima do total — rows vazio, total preservado
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 99, _page_size: 5,
    });
    assert("paginated: página vazia devolve rows=[]", Array.isArray(data.rows) && data.rows.length === 0, data);
    assert("paginated: página vazia preserva total correto", Number(data.total) === EXTRA_N, data);
    assert("paginated: página vazia ecoa page/page_size solicitados",
      data.page === 99 && data.page_size === 5, data);
  }

  // 8e) page_size > 100 é limitado a 100
  {
    const { data } = await A.rpc("list_company_processes_paginated", { _client_id: ctx.cA, _page: 1, _page_size: 500 });
    assert("paginated: page_size >100 é limitado a 100", data.page_size === 100, data.page_size);
  }

  // 8f) page < 1 normalizada para 1
  {
    const { data } = await A.rpc("list_company_processes_paginated", { _client_id: ctx.cA, _search: `PAG-${TAG}`, _page: 0, _page_size: 5 });
    assert("paginated: page<1 normalizada (mesmo conjunto que page=1)",
      Array.isArray(data.rows) && data.rows.length === 5, { rows: data.rows.length });
  }

  // 8g) Filtro por status
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _status: "aguardando_cliente", _page: 1, _page_size: 100,
    });
    const allAg = data.rows.every((r) => r.status === "aguardando_cliente");
    assert("paginated: filtro por status aplicado antes da paginação",
      allAg && data.rows.length > 0 && data.rows.length < EXTRA_N, { count: data.rows.length, allAg });
  }

  // 8h) Filtro por prioridade
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _prioridade: "alta", _page: 1, _page_size: 100,
    });
    const allAlta = data.rows.every((r) => r.prioridade === "alta");
    assert("paginated: filtro por prioridade aplicado", allAlta && data.rows.length > 0, data.rows.map((r) => r.prioridade));
  }

  // 8i) Filtro por tipo de processo
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _process_type_id: ctx.ptype ?? created.ptype, _search: `PAG-${TAG}`, _page: 1, _page_size: 100,
    });
    assert("paginated: filtro por process_type_id aplicado",
      data.rows.length === EXTRA_N && data.rows.every((r) => r.process_type_id === (ctx.ptype ?? created.ptype)),
      { count: data.rows.length });
  }

  // 8j) Filtro por responsável — nossos extras têm responsavel_id NULL
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _responsavel_id: ctx.adminId, _page: 1, _page_size: 100,
    });
    assert("paginated: filtro por responsável não retorna extras (responsavel=null)",
      data.rows.length === 0, { rows: data.rows.length });
  }

  // 8k) Filtro por prazo — nossos extras têm prazo_final=2099-12-31 (nem vencido, nem hoje, nem em_breve)
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _prazo: "vencido", _page: 1, _page_size: 100,
    });
    assert("paginated: filtro _prazo=vencido exclui extras com prazo em 2099",
      data.rows.length === 0, { rows: data.rows.length });
  }

  // 8l) Filtro Real/Demo — nossos extras são reais (is_demo=false por default)
  {
    const { data: onlyDemo } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _only_demo: true, _include_demo: true, _page: 1, _page_size: 100,
    });
    assert("paginated: _only_demo=true não retorna processos reais",
      onlyDemo.rows.length === 0, { rows: onlyDemo.rows.length });
    const { data: noDemo } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _include_demo: false, _page: 1, _page_size: 100,
    });
    assert("paginated: _include_demo=false ainda retorna os reais",
      noDemo.rows.length === EXTRA_N, { rows: noDemo.rows.length });
  }

  // 8m) Combinação de filtros
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _client_id: ctx.cA, _search: `PAG-${TAG}`, _status: "em_andamento", _prioridade: "alta",
      _page: 1, _page_size: 100,
    });
    const ok = data.rows.every((r) => r.status === "em_andamento" && r.prioridade === "alta");
    assert("paginated: combinação status + prioridade aplicada",
      ok && data.rows.length > 0 && data.rows.length < EXTRA_N, { count: data.rows.length });
  }

  // 8n) Busca textual em observacoes
  {
    const { data } = await A.rpc("list_company_processes_paginated", {
      _search: `PAG-${TAG}-03`, _page: 1, _page_size: 10,
    });
    assert("paginated: busca textual retorna somente o registro correspondente",
      data.rows.length === 1 && (data.rows[0].observacoes || "").includes(`PAG-${TAG}-03`),
      data.rows.map((r) => r.observacoes));
  }

  // 8o) Isolamento por papel: colaborador vinculado a A vê extras; sem vínculo não vê nada
  {
    const { data } = await CW.rpc("list_company_processes_paginated", {
      _search: `PAG-${TAG}`, _page: 1, _page_size: 100,
    });
    assert("paginated: colaborador vinculado vê os 12 extras do cliente A",
      data.rows.length === EXTRA_N && Number(data.total) === EXTRA_N, { rows: data.rows.length, total: data.total });
  }
  {
    const { data } = await CS.rpc("list_company_processes_paginated", {
      _search: `PAG-${TAG}`, _page: 1, _page_size: 100,
    });
    assert("paginated: colaborador SEM vínculo não vê os extras",
      data.rows.length === 0 && Number(data.total) === 0, data);
  }

  // 8p) Admin vê registros de clientes distintos (sem filtro _client_id)
  {
    const { data } = await A.rpc("list_company_processes_paginated", { _page: 1, _page_size: 100 });
    const clientIds = new Set(data.rows.map((r) => r.client_id));
    assert("paginated: admin recebe registros de múltiplos clientes",
      clientIds.size >= 2, { distinctClients: clientIds.size });
  }

  // 8q) Aba "meus" respeita o usuário autenticado (admin sem processos atribuídos → vazio)
  {
    const { data } = await A.rpc("list_company_processes_paginated", { _tab: "meus", _search: `PAG-${TAG}`, _page: 1, _page_size: 100 });
    assert("paginated: aba 'meus' filtra por responsavel_id = auth.uid()",
      data.rows.length === 0, { rows: data.rows.length });
  }

  // 8r) Anon é bloqueado
  {
    const { error } = await anonClient.rpc("list_company_processes_paginated", { _page: 1, _page_size: 5 });
    assert("paginated: anon NÃO executa list_company_processes_paginated", !!error, error);
  }

  // 8s) União completa via loop
  {
    const walk = await pageAll({ _client_id: ctx.cA, _search: `PAG-${TAG}`, _page_size: 5, _sort_by: "abertura" });
    const seen = new Set();
    let dup = null;
    for (const p of walk.pages) for (const r of p.rows) { if (seen.has(r.id)) dup = r.id; seen.add(r.id); }
    assert("paginated: walk-through — sem duplicação entre páginas", !dup, dup);
    assert("paginated: walk-through — união = 12 esperados", seen.size === EXTRA_N, { seen: seen.size });
    assert("paginated: walk-through — total consistente entre páginas",
      walk.totals.length === 1 && walk.totals[0] === EXTRA_N, walk.totals);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 9) PAGINAÇÃO — list_my_process_steps_paginated (prova >500)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Cria 505 etapas atribuídas ao colaborador vinculado (cwId), pendentes,
  // dentro de um dos processos extras do cliente A (que ele já enxerga por
  // RLS). Também cria 1 etapa com responsavel_id=NULL para provar que a RPC
  // não quebra e que a etapa nula não aparece na listagem do colaborador.

  const STEPS_N = 505;
  const stepsHostProcess = extraIds[0];
  {
    const rows = [];
    for (let i = 0; i < STEPS_N; i++) {
      rows.push({
        company_process_id: stepsHostProcess,
        nome: `PAG-STEP-${TAG}-${i.toString().padStart(4, "0")}`,
        ordem: i + 100, // fora do range das etapas de setup
        status: "pendente",
        responsavel_id: ctx.cwId,
        prazo: "2099-12-31",
      });
    }
    // Insert em batches para não estourar payload
    const CHUNK = 200;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await admin.from("company_process_steps").insert(rows.slice(i, i + CHUNK));
      if (error) throw new Error(`bulk steps insert@${i}: ${error.message}`);
    }
    // Etapa com responsavel_id=NULL para o cenário 26 (não deve quebrar).
    const { error: eNull } = await admin.from("company_process_steps").insert({
      company_process_id: stepsHostProcess, nome: `PAG-STEP-NULL-${TAG}`,
      ordem: 5000, status: "pendente", responsavel_id: null,
    });
    if (eNull) throw new Error(`null responsavel step: ${eNull.message}`);
  }

  // 9a) Total > 500 e page_size 100 respeitados
  {
    const { data, error } = await CW.rpc("list_my_process_steps_paginated", {
      _status_group: "open", _page: 1, _page_size: 100,
    });
    assert("meus-steps: rpc responde sem erro", !error, error);
    assert("meus-steps: total > 500 (prova de que o limite de 500 sumiu)",
      Number(data.total) > 500, { total: data.total });
    assert("meus-steps: total inclui as 505 etapas criadas", Number(data.total) >= STEPS_N, data.total);
    assert("meus-steps: page_size respeitado (100)", data.page_size === 100 && data.rows.length === 100, {
      pageSize: data.page_size, rows: data.rows.length,
    });
  }

  // 9b) Percorrer todas as páginas e provar união == total, sem duplicação
  {
    const seen = new Set();
    let dup = null;
    let totalEcho = null;
    let page = 1;
    for (;;) {
      const { data } = await CW.rpc("list_my_process_steps_paginated", {
        _status_group: "open", _page: page, _page_size: 100,
      });
      if (totalEcho === null) totalEcho = Number(data.total);
      for (const r of data.rows) { if (seen.has(r.id)) dup = r.id; seen.add(r.id); }
      if (data.rows.length < data.page_size) break;
      page++;
      if (page > 50) throw new Error("safety-break");
    }
    assert("meus-steps: walk-through sem duplicação", !dup, dup);
    assert("meus-steps: soma das páginas = total anunciado", seen.size === totalEcho, { seen: seen.size, totalEcho });

    // 9c) Prova de que registros ALÉM da posição 500 aparecem
    const beyondPage = Math.ceil(501 / 100); // = 6ª página com page_size=100
    const { data: pBeyond } = await CW.rpc("list_my_process_steps_paginated", {
      _status_group: "open", _page: beyondPage, _page_size: 100,
    });
    assert("meus-steps: registros após a posição 500 são acessíveis via paginação",
      pBeyond.rows.length > 0, { page: beyondPage, rows: pBeyond.rows.length });
  }

  // 9d) Página vazia (além do total) — rows=[], total preservado
  {
    const { data } = await CW.rpc("list_my_process_steps_paginated", { _page: 999, _page_size: 100 });
    assert("meus-steps: página vazia devolve rows=[] com total > 0",
      data.rows.length === 0 && Number(data.total) > 500, data);
  }

  // 9e) Isolamento — colaborador sem vínculo não recebe etapas
  {
    const { data } = await CS.rpc("list_my_process_steps_paginated", { _page: 1, _page_size: 100 });
    assert("meus-steps: colaborador sem vínculo → total=0", Number(data.total) === 0, data);
  }

  // 9f) Escopo — outra sessão não vê etapas do CW
  {
    const { data } = await A.rpc("list_my_process_steps_paginated", { _page: 1, _page_size: 100 });
    // Admin não é responsável de nenhuma dessas etapas: não devem aparecer aqui.
    const anyCwOwned = data.rows.some((r) => (r.nome || "").startsWith(`PAG-STEP-${TAG}-`));
    assert("meus-steps: admin não recebe etapas atribuídas a outro usuário",
      !anyCwOwned, { peek: data.rows.slice(0, 3).map((r) => r.nome) });
  }

  // 9g) Filtro por status_group
  {
    const { data } = await CW.rpc("list_my_process_steps_paginated", { _status_group: "done", _page: 1, _page_size: 100 });
    // Nada foi concluído: esperado 0 (ou apenas conclusões pré-existentes fora deste teste)
    const allDone = data.rows.every((r) => r.status === "concluida");
    assert("meus-steps: filtro status_group=done retorna apenas 'concluida'", allDone, data.rows.map((r) => r.status));
  }

  // 9h) Filtro por prazo
  {
    const { data } = await CW.rpc("list_my_process_steps_paginated", { _prazo: "vencido", _page: 1, _page_size: 100 });
    const anyOurs = data.rows.some((r) => (r.nome || "").startsWith(`PAG-STEP-${TAG}-`));
    assert("meus-steps: _prazo=vencido não retorna as etapas com prazo em 2099", !anyOurs, {
      sample: data.rows.slice(0, 3).map((r) => r.nome),
    });
  }

  // 9i) Busca textual
  {
    const { data } = await CW.rpc("list_my_process_steps_paginated", {
      _search: `PAG-STEP-${TAG}-0007`, _page: 1, _page_size: 10,
    });
    assert("meus-steps: busca textual retorna somente o registro correspondente",
      data.rows.length === 1 && data.rows[0].nome.endsWith("-0007"), data.rows.map((r) => r.nome));
  }

  // 9j) Responsável NULL não quebra a query (a etapa PAG-STEP-NULL não aparece
  //     porque o filtro é responsavel_id = auth.uid()); confirma ausência de erro.
  {
    const { data, error } = await CW.rpc("list_my_process_steps_paginated", { _search: `PAG-STEP-NULL-${TAG}`, _page: 1, _page_size: 10 });
    assert("meus-steps: responsavel_id NULL não quebra a RPC", !error && data.rows.length === 0, { error, rows: data?.rows?.length });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 10) GRANTS & SECURITY INVOKER (asserções estruturais)
  // ═════════════════════════════════════════════════════════════════════════
  // Confirmação indireta: as duas RPCs foram exercitadas com sucesso por
  // authenticated e falharam para anon (asserts 8r acima e abaixo). Também
  // asseguramos aqui que o campo `page_size` retornado nunca ultrapassa 100.
  {
    const { data } = await CW.rpc("list_my_process_steps_paginated", { _page: 1, _page_size: 999 });
    assert("meus-steps: page_size limitado a 100 mesmo com input abusivo", data.page_size === 100, data.page_size);
  }
  {
    const { error } = await anonClient.rpc("list_my_process_steps_paginated", { _page: 1, _page_size: 5 });
    assert("meus-steps: anon NÃO executa list_my_process_steps_paginated", !!error, error);
  }
}

let exitCode = 0;
try {
  await run();
} catch (e) {
  console.error("ERRO NA EXECUÇÃO:", e?.message ?? e);
  exitCode = 1;
} finally {
  try { await teardown(); } catch (e) { console.error("teardown:", e?.message ?? e); }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nResumo: ${results.length - failed.length}/${results.length} OK`);
  if (failed.length) {
    console.log("Falhas:");
    for (const f of failed) console.log(" - " + f.name + (f.extra ? " " + JSON.stringify(f.extra) : ""));
    exitCode = 1;
  }
  process.exit(exitCode);
}
