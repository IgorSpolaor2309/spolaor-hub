#!/usr/bin/env node
/**
 * Validação — abertura de conversa pelo perfil CLIENTE (Interações).
 *
 * Modelo atual: UMA conversa por empresa (unique em chat_conversations.client_id).
 * Fonte de escrita do cliente: RPC public.client_open_interaction.
 *
 * Uso: node scripts/tests/interacoes-cliente.mjs
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

const TAG = `intcli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = {
  admin: `adm-${TAG}@test.local`,
  collab: `col-${TAG}@test.local`,
  client: `cli-${TAG}@test.local`,
  client2: `cli2-${TAG}@test.local`,
  outsider: `out-${TAG}@test.local`,
};

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

const created = { users: [], clients: [], paths: [], collabs: [] };

async function createUser(email, isDemo = false) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PWD, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  created.users.push(data.user.id);
  await admin.from("profiles").upsert({ id: data.user.id, email, full_name: email, status: "active", is_demo: isDemo });
  return data.user.id;
}
async function grantRole(uid, role, isDemo = false) {
  const { error } = await admin.from("user_roles").insert({ user_id: uid, role, is_demo: isDemo });
  if (error && !/duplicate/i.test(error.message)) throw new Error(`grantRole: ${error.message}`);
}
async function mkClient(nome, patch = {}) {
  const { data, error } = await admin
    .from("clients")
    .insert({ razao_social: nome, status: "active", origem_cadastro: "manual", ...patch })
    .select("id")
    .single();
  if (error) throw new Error(`mkClient: ${error.message}`);
  created.clients.push(data.id);
  return data.id;
}
async function link(clientId, uid, isDemo = false) {
  const { error } = await admin.from("client_users").insert({ client_id: clientId, user_id: uid, ativo: true, papel: "titular", is_demo: isDemo });
  if (error) throw new Error(`client_users: ${error.message}`);
}

const ctx = {};

async function setup() {
  ctx.adminId = await createUser(E.admin);
  ctx.collabId = await createUser(E.collab);
  ctx.clientUid = await createUser(E.client);
  ctx.client2Uid = await createUser(E.client2, true); // conta demo
  ctx.outsiderUid = await createUser(E.outsider);
  await grantRole(ctx.adminId, "admin");
  await grantRole(ctx.collabId, "collaborator");
  await grantRole(ctx.clientUid, "client");
  await grantRole(ctx.client2Uid, "client", true);
  await grantRole(ctx.outsiderUid, "client");

  const { data: col, error: colErr } = await admin
    .from("collaborators")
    .insert({ user_id: ctx.collabId, nome: `${TAG} colaborador`, email: E.collab, status: "active" })
    .select("id")
    .single();
  if (colErr) throw new Error(`collaborators: ${colErr.message}`);
  created.collabs.push(col.id);
  ctx.collabRowId = col.id;

  // Empresa A (cliente vinculado, colaborador responsável), B (multiempresa), C (externa)
  ctx.cA = await mkClient(`${TAG} Empresa A`, { owner_profile_id: ctx.collabId });
  ctx.cB = await mkClient(`${TAG} Empresa B`);
  ctx.cC = await mkClient(`${TAG} Empresa C externa`, { is_demo: true });
  ctx.cDemo = await mkClient(`${TAG} Empresa Demo`, { is_demo: true });

  // Responsabilidade da equipe = client_collaborators (base das notificações).
  for (const cid of [ctx.cA, ctx.cB]) {
    const { error } = await admin.from("client_collaborators").insert({ client_id: cid, collaborator_id: col.id });
    if (error) throw new Error(`client_collaborators: ${error.message}`);
  }

  await link(ctx.cA, ctx.clientUid);
  await link(ctx.cB, ctx.clientUid);
  await link(ctx.cC, ctx.client2Uid, true);
  await link(ctx.cDemo, ctx.client2Uid, true);

  ctx.CL = userClient(await signIn(E.client));
  ctx.CL2 = userClient(await signIn(E.client2));
  ctx.OUT = userClient(await signIn(E.outsider));
  ctx.COL = userClient(await signIn(E.collab));
  ctx.AD = userClient(await signIn(E.admin));
}

async function teardown() {
  try {
    if (created.paths.length) await admin.storage.from("documents").remove(created.paths);
    if (created.clients.length) {
      await admin.from("chat_messages").delete().in("client_id", created.clients);
      await admin.from("chat_conversations").delete().in("client_id", created.clients);
      await admin.from("client_users").delete().in("client_id", created.clients);
      await admin.from("client_collaborators").delete().in("client_id", created.clients);
      await admin.from("timeline_events").delete().in("client_id", created.clients);
      await admin.from("clients").delete().in("id", created.clients);
    }
    if (created.collabs.length) await admin.from("collaborators").delete().in("id", created.collabs);
    for (const u of created.users) {
      await admin.from("notifications").delete().eq("user_id", u);
      await admin.from("user_roles").delete().eq("user_id", u);
      await admin.auth.admin.deleteUser(u);
    }
  } catch (e) {
    console.log("teardown warn:", e.message);
  }
}

const openInteraction = (c, args) => c.rpc("client_open_interaction", args);

async function run() {
  await setup();
  const { CL, CL2, OUT, COL, AD } = ctx;

  // 0 — contrato: uma conversa por empresa
  {
    const { data } = await admin.rpc("client_open_interaction", { _client_id: ctx.cA, _body: "x" }).then(
      () => ({ data: null }),
      () => ({ data: null }),
    );
    void data;
    const { count } = await admin
      .from("chat_conversations")
      .select("id", { count: "exact", head: true })
      .eq("client_id", ctx.cA);
    assert("0. contrato: no máximo uma conversa por empresa antes do teste", (count ?? 0) <= 1, count);
  }

  // 1 — cliente vinculado consegue abrir conversa
  let convA;
  {
    const { data, error } = await openInteraction(CL, { _client_id: ctx.cA, _body: "Olá, preciso de ajuda" });
    assert("1. cliente vinculado consegue abrir conversa", !error && !!data?.conversation_id, error);
    convA = data?.conversation_id;
    assert("1b. conversa foi criada nesta chamada", data?.conversation_created === true, data);
    assert("1c. retorno traz apenas campos explícitos",
      data && Object.keys(data).sort().join(",") ===
        "client_id,conversation_created,conversation_id,empresa,message_deduplicated,message_id", data && Object.keys(data));
  }

  // 9 — primeira mensagem salva
  {
    const { data: msgs } = await admin
      .from("chat_messages")
      .select("id, body, sender_role, sender_profile_id, attachment_path")
      .eq("conversation_id", convA);
    assert("9. primeira mensagem é salva", (msgs ?? []).length === 1 && msgs[0].body === "Olá, preciso de ajuda", msgs);
    assert("9b. mensagem gravada com sender_role=client e autor correto",
      msgs?.[0]?.sender_role === "client" && msgs?.[0]?.sender_profile_id === ctx.clientUid);
  }

  // 12 / 13 — notificação para a equipe responsável, sem duplicar
  {
    const { data: notes } = await admin
      .from("notifications")
      .select("id, user_id, tipo, link")
      .eq("user_id", ctx.collabId)
      .eq("tipo", "chat");
    assert("12. colaborador responsável recebe notificação", (notes ?? []).length >= 1, notes?.length);
    assert("12b. notificação aponta para a conversa correta",
      (notes ?? []).some((n) => (n.link ?? "").includes(convA)));
    assert("13. notificação não duplica (1 por mensagem)", (notes ?? []).length === 1, notes?.length);
    const { data: selfNotes } = await admin
      .from("notifications").select("id").eq("user_id", ctx.clientUid).eq("tipo", "chat");
    assert("13b. autor da mensagem não é notificado", (selfNotes ?? []).length === 0, selfNotes?.length);
  }

  // 7 / 8 — conversa existente reutilizada, sem duplicata
  {
    const { data, error } = await openInteraction(CL, { _client_id: ctx.cA, _body: "Segunda mensagem" });
    assert("7. conversa existente é reutilizada", !error && data?.conversation_id === convA, error ?? data);
    assert("7b. nenhuma conversa nova foi criada", data?.conversation_created === false, data);
    const { count } = await admin
      .from("chat_conversations").select("id", { count: "exact", head: true }).eq("client_id", ctx.cA);
    assert("8. conversa duplicada não é criada", count === 1, count);
  }

  // 14 — duplo clique não duplica mensagem
  {
    const args = { _client_id: ctx.cA, _body: "Mensagem de duplo clique" };
    const [r1, r2] = await Promise.all([openInteraction(CL, args), openInteraction(CL, args)]);
    assert("14. duplo clique aceito sem erro", !r1.error && !r2.error, r1.error ?? r2.error);
    const { data: dups } = await admin
      .from("chat_messages").select("id").eq("conversation_id", convA).eq("body", "Mensagem de duplo clique");
    assert("14b. duplo clique não duplica a mensagem", (dups ?? []).length === 1, dups?.length);
    assert("14c. retorno sinaliza deduplicação",
      (r1.data?.message_deduplicated === true) || (r2.data?.message_deduplicated === true), [r1.data, r2.data]);
  }

  // 2 / 3 / 5 — empresas visíveis ao cliente
  {
    const { data: mine } = await CL.from("clients").select("id").is("deleted_at", null).neq("status", "inactive");
    const ids = (mine ?? []).map((c) => c.id);
    assert("3. cliente multiempresa enxerga apenas as próprias empresas",
      ids.includes(ctx.cA) && ids.includes(ctx.cB) && !ids.includes(ctx.cC), ids.length);
    assert("5. cliente não vê empresa de outra conta", !ids.includes(ctx.cC) && !ids.includes(ctx.cDemo));
    const { data: single } = await CL2.from("clients").select("id").is("deleted_at", null).neq("status", "inactive");
    assert("2. seleção automática: cliente com poucas empresas recebe lista enxuta",
      (single ?? []).every((c) => [ctx.cC, ctx.cDemo].includes(c.id)), (single ?? []).map((c) => c.id));
  }

  // 4 / 19 — client_id externo e usuário sem vínculo
  {
    const ext = await openInteraction(CL, { _client_id: ctx.cC, _body: "tentativa externa" });
    assert("4. client_id externo é bloqueado", !!ext.error, ext.data);
    const { count } = await admin
      .from("chat_conversations").select("id", { count: "exact", head: true }).eq("client_id", ctx.cC);
    assert("4b. nenhuma conversa criada para empresa externa", (count ?? 0) === 0, count);
    const out = await openInteraction(OUT, { _client_id: ctx.cA, _body: "sem vínculo" });
    assert("19. usuário sem vínculo é bloqueado", !!out.error, out.data);
    const collabTry = await openInteraction(COL, { _client_id: ctx.cA, _body: "colaborador" });
    assert("19b. papel não-cliente não usa a RPC de cliente", !!collabTry.error, collabTry.data);
  }

  // 6 — Real/Demo isolado
  {
    const demoTry = await openInteraction(CL, { _client_id: ctx.cDemo, _body: "empresa demo" });
    assert("6. cliente real não abre conversa em empresa demo não vinculada", !!demoTry.error, demoTry.data);
    const demoOk = await openInteraction(CL2, { _client_id: ctx.cDemo, _body: "demo vinculada" });
    assert("6b. cliente vinculado à empresa demo abre normalmente", !demoOk.error, demoOk.error);
    const { data: convs } = await CL.from("chat_conversations").select("client_id");
    assert("6c. conversa demo não vaza para o cliente real",
      !(convs ?? []).some((c) => c.client_id === ctx.cDemo), convs);
  }

  // 10 / 11 — anexo e ausência de storage_path no payload
  {
    const path = `${ctx.cA}/chat/nova/${Date.now()}_anexo.txt`;
    const up = await admin.storage.from("documents").upload(path, new Blob(["anexo"]), { contentType: "text/plain" });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    created.paths.push(path);
    const { data, error } = await openInteraction(CL, {
      _client_id: ctx.cA, _attachment_path: path, _attachment_name: "anexo.txt", _attachment_size: 5,
    });
    assert("10. anexo permitido é salvo", !error && !!data?.message_id, error);
    const { data: m } = await admin
      .from("chat_messages").select("attachment_path, attachment_name").eq("id", data.message_id).single();
    assert("10b. anexo vinculado à mensagem", m?.attachment_path === path && m?.attachment_name === "anexo.txt", m);
    assert("11. storage_path não aparece no payload da RPC",
      !JSON.stringify(data).includes(path) && !("attachment_path" in (data ?? {})), data);

    const badPath = `${ctx.cC}/chat/nova/hack.txt`;
    const bad = await openInteraction(CL, { _client_id: ctx.cA, _attachment_path: badPath, _attachment_name: "hack.txt" });
    assert("11b. anexo fora da pasta da empresa é recusado", !!bad.error, bad.data);
  }

  // conversa vazia
  {
    const empty = await openInteraction(CL, { _client_id: ctx.cB });
    assert("conversa vazia é recusada (sem texto e sem anexo)", !!empty.error, empty.data);
    const { count } = await admin
      .from("chat_conversations").select("id", { count: "exact", head: true }).eq("client_id", ctx.cB);
    assert("nenhuma conversa vazia criada", (count ?? 0) === 0, count);
  }

  // 15 — conversa aparece imediatamente na lista do cliente
  {
    const { data: convs, error } = await CL
      .from("chat_conversations")
      .select("id, client_id, last_message_at")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    assert("15. conversa aparece imediatamente na lista do cliente",
      !error && (convs ?? []).some((c) => c.id === convA), error ?? convs);
    assert("15b. last_message_at atualizado pela primeira mensagem",
      !!(convs ?? []).find((c) => c.id === convA)?.last_message_at);
  }

  // 16 — colaborador continua criando e respondendo
  {
    const { data: convB, error: cErr } = await COL
      .from("chat_conversations").insert({ client_id: ctx.cB }).select("id").single();
    assert("16. colaborador continua conseguindo criar conversa", !cErr && !!convB?.id, cErr);
    const { error: mErr } = await COL.from("chat_messages").insert({
      conversation_id: convA, client_id: ctx.cA, sender_profile_id: ctx.collabId,
      sender_role: "collaborator", body: "resposta da equipe",
    });
    assert("16b. colaborador continua conseguindo responder", !mErr, mErr);
    const { data: clientNotes } = await admin
      .from("notifications").select("id").eq("user_id", ctx.clientUid).eq("tipo", "chat");
    assert("16c. cliente é notificado da resposta da equipe", (clientNotes ?? []).length === 1, clientNotes?.length);
  }

  // 17 — admin mantém acesso
  {
    const { data: convs, error } = await AD.from("chat_conversations").select("id, client_id");
    assert("17. admin mantém acesso às conversas", !error && (convs ?? []).some((c) => c.id === convA), error);
    const { data: msgs, error: mErr } = await AD
      .from("chat_messages").select("id").eq("conversation_id", convA);
    assert("17b. admin lê as mensagens", !mErr && (msgs ?? []).length > 0, mErr);
  }

  // 18 — realtime preservado (publicação + código)
  {
    const page = readFileSync("src/routes/_authenticated/interacoes.tsx", "utf8");
    assert("18. realtime de conversas e mensagens preservado no código",
      /postgres_changes[\s\S]*chat_conversations/.test(page) && /postgres_changes[\s\S]*chat_messages/.test(page));
  }

  // Estáticos — UI e segurança
  {
    const page = readFileSync("src/routes/_authenticated/interacoes.tsx", "utf8");
    const dlg = readFileSync("src/components/sc/ClientNewConversationDialog.tsx", "utf8");
    assert("UI: botão Nova conversa disponível para o cliente", /ClientNewConversationDialog/.test(page) && /Nova conversa/.test(dlg));
    assert("UI: cliente escreve mensagem e pode anexar", /Textarea/.test(dlg) && /Anexar arquivo/.test(dlg));
    assert("UI: seleção automática quando há uma única empresa", /companies\.length === 1/.test(dlg));
    assert("UI: reaproveita conversa existente com rótulo 'Abrir conversa'", /Abrir conversa/.test(dlg));
    assert("UI: prevenção de duplo clique pelo estado de envio", /isPending/.test(dlg) && /disabled=\{!canSubmit \|\| openInteraction\.isPending\}/.test(dlg));
    assert("UI: cliente não insere direto em chat_conversations/chat_messages",
      !/from\("chat_conversations"\)/.test(dlg) && !/from\("chat_messages"\)/.test(dlg) && /client_open_interaction/.test(dlg));
    assert("UI: fluxo do colaborador preservado", /function NewConversationButton/.test(page) && /ensureConversation/.test(page));
    assert("UI: nenhuma conversa é criada automaticamente ao abrir a página",
      !/ensureConversation\.autoCreate/.test(page));
    assert("UI: modelos de mensagem da equipe preservados", /TEMPLATE_CATEGORIES/.test(page));
  }

  // Segurança da função
  {
    const { data: meta } = await admin.rpc("client_list_pending_actions", { _page_size: 1 }).then(
      () => ({ data: null }), () => ({ data: null }));
    void meta;
    const anonC = createClient(URL_, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
    const anonTry = await anonC.rpc("client_open_interaction", { _client_id: ctx.cA, _body: "anon" });
    assert("segurança: anon não executa a RPC", !!anonTry.error, anonTry.data);
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
