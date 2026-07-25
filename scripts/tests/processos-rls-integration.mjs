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
    const { error } = await A.rpc("client_list_processes");
    assert("admin executa client_list_processes (grant authenticated) — retorno pode ser vazio", !error, error);
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
