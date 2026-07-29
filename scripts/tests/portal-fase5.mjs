#!/usr/bin/env node
/**
 * Validação da FASE 5 — Portal do Cliente (/meus-documentos).
 *
 * Integração autenticada real: cria admin + cliente, duas empresas (A vinculada
 * ao cliente, B isolada), solicitações em todos os status unificados, e valida
 * a RPC `list_client_document_workspace_paginated` (fonte exclusiva do portal),
 * o fluxo de upload/reenvio, isolamento multi-empresa, ausência de campos
 * internos e ausência de duplicação de timeline/notificações.
 *
 * Também roda asserções estáticas sobre os arquivos do portal (Fase 5).
 *
 * Uso: node scripts/tests/portal-fase5.mjs
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

const TAG = `portal5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = { admin: `adm-${TAG}@test.local`, client: `cli-${TAG}@test.local` };

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok, extra: ok ? undefined : extra });
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

const created = { users: [], clients: [], reqs: [], docs: [], paths: [] };

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
      tipo_solicitacao: patch.tipo ?? "outro",
      ...(patch.document_id ? { document_id: patch.document_id } : {}),
    })
    .select("id, status")
    .single();
  if (error) throw new Error(`mkReq(${patch.titulo}/${patch.status}): ${error.message}`);
  created.reqs.push(data.id);
  return data.id;
}

const ctx = {};

async function setup() {
  const adminId = await createUser(E.admin);
  const clientUid = await createUser(E.client);
  await grantRole(adminId, "admin");
  await grantRole(clientUid, "client");
  ctx.adminId = adminId;
  ctx.clientUid = clientUid;

  ctx.cA = await mkClient(`${TAG} Empresa A`);
  ctx.cB = await mkClient(`${TAG} Empresa B`);

  const { error: cuErr } = await admin
    .from("client_users")
    .insert({ client_id: ctx.cA, user_id: clientUid, ativo: true, papel: "titular" });
  if (cuErr) throw new Error(`client_users: ${cuErr.message}`);

  // Empresa A — um item por status
  ctx.reqAguardandoCliente = await mkReq(ctx.cA, { titulo: "aguardando-staff-criou", status: "aguardando", criado_por_role: "staff" });
  ctx.reqAguardandoStaff = await mkReq(ctx.cA, { titulo: "aguardando-cliente-criou", status: "aguardando", criado_por_role: "client" });
  ctx.reqReenviar = await mkReq(ctx.cA, { titulo: "reenviar", status: "reenviar", criado_por_role: "staff" });
  ctx.reqRecebido = await mkReq(ctx.cA, { titulo: "recebido", status: "recebido" });
  ctx.reqConcluido = await mkReq(ctx.cA, { titulo: "concluido", status: "concluido" });
  ctx.reqCancelado = await mkReq(ctx.cA, { titulo: "cancelado", status: "cancelado" });
  // Volume para paginação
  ctx.bulk = [];
  for (let i = 0; i < 5; i++) {
    ctx.bulk.push(await mkReq(ctx.cA, { titulo: `bulk-${i}`, status: "aguardando", criado_por_role: "staff" }));
  }
  // Empresa B (não vinculada) — deve ser invisível
  ctx.reqB = await mkReq(ctx.cB, { titulo: "empresaB", status: "aguardando", criado_por_role: "staff" });

  // Documento da empresa B, para testar leitura cross-empresa
  const pathB = `${ctx.cB}/${TAG}-b.txt`;
  await admin.storage.from("documents").upload(pathB, new Blob(["conteudo B"]), { contentType: "text/plain" });
  created.paths.push(pathB);
  const { data: docB, error: docBErr } = await admin
    .from("documents")
    .insert({ client_id: ctx.cB, nome: "docB.txt", tipo: "outro", status: "recebido", storage_path: pathB })
    .select("id")
    .single();
  if (docBErr) throw new Error(`docB: ${docBErr.message}`);
  created.docs.push(docB.id);
  ctx.docB = docB.id;

  ctx.clientTok = await signIn(E.client);
  ctx.CL = userClient(ctx.clientTok);
  ctx.A = userClient(await signIn(E.admin));
}

async function teardown() {
  try {
    if (created.paths.length) await admin.storage.from("documents").remove(created.paths);
    if (created.reqs.length) await admin.from("document_requests").delete().in("id", created.reqs);
    if (created.clients.length) {
      await admin.from("document_requests").delete().in("client_id", created.clients);
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

const portal = (client, args) => client.rpc("list_client_document_workspace_paginated", args);

async function run() {
  await setup();
  const { CL, A } = ctx;

  // ─── 1. Isolamento multi-empresa ────────────────────────────────────────
  {
    const { data, error } = await portal(CL, { _section: "precisa_enviar", _page_size: 100 });
    assert("portal responde para usuário cliente autenticado", !error, error);
    const rows = data?.rows ?? [];
    assert("1. cliente vê apenas empresas vinculadas (somente empresa A)",
      rows.length > 0 && rows.every((r) => r.client_id === ctx.cA),
      rows.map((r) => r.client_id).filter((v, i, a) => a.indexOf(v) === i));
    assert("1b. item da empresa B não aparece", !rows.some((r) => r.item_id === ctx.reqB));
  }

  // ─── 2. Forçar client_id externo ────────────────────────────────────────
  {
    const { data } = await portal(CL, { _section: "precisa_enviar", _client_id: ctx.cB, _page_size: 100 });
    assert("2. forçar _client_id da empresa B retorna vazio", (data?.rows ?? []).length === 0, data?.rows?.length);
    const h = await portal(CL, { _section: "historico", _client_id: ctx.cB, _page_size: 100 });
    assert("2b. idem na seção histórico", (h.data?.rows ?? []).length === 0, h.data?.rows?.length);
    assert("2c. counts também zerados ao forçar empresa externa", (h.data?.counts?.todos ?? -1) === 0, h.data?.counts);
  }

  // ─── 3. Seção "Preciso enviar" ──────────────────────────────────────────
  {
    const { data } = await portal(CL, { _section: "precisa_enviar", _page_size: 100 });
    const rows = data.rows;
    assert("3. 'Preciso enviar' só traz aguardando+client ou reenviar",
      rows.every((r) => (r.status === "aguardando" && r.action_owner === "client") || r.status === "reenviar"),
      rows.map((r) => [r.status, r.action_owner]));
    assert("3b. inclui o item aguardando criado pela equipe", rows.some((r) => r.item_id === ctx.reqAguardandoCliente));
    assert("3c. inclui o item reenviar", rows.some((r) => r.item_id === ctx.reqReenviar));
    assert("3d. NÃO inclui aguardando cuja ação é da contabilidade", !rows.some((r) => r.item_id === ctx.reqAguardandoStaff));
    assert("3e. NÃO inclui recebido/concluído/cancelado",
      !rows.some((r) => ["recebido", "concluido", "cancelado"].includes(r.status)));
  }

  // ─── 4. Seção "Histórico" ───────────────────────────────────────────────
  {
    const { data } = await portal(CL, { _section: "historico", _page_size: 100 });
    const rows = data.rows;
    assert("4. 'Histórico' só traz recebido/concluído/cancelado",
      rows.every((r) => ["recebido", "concluido", "cancelado"].includes(r.status)), rows.map((r) => r.status));
    assert("4b. contém recebido", rows.some((r) => r.item_id === ctx.reqRecebido));
    assert("4c. contém concluído", rows.some((r) => r.item_id === ctx.reqConcluido));
    assert("4d. contém cancelado", rows.some((r) => r.item_id === ctx.reqCancelado));
    assert("4e. expõe metadados de documento (has_document/document_id/document_name)",
      rows.every((r) => "has_document" in r && "document_id" in r && "document_name" in r));
  }

  // ─── 11/12/13. Campos internos ──────────────────────────────────────────
  {
    const payloads = [];
    for (const s of ["precisa_enviar", "historico"]) {
      const { data } = await portal(CL, { _section: s, _page_size: 100 });
      payloads.push(JSON.stringify(data));
    }
    const all = payloads.join("|");
    assert("11. observacoes_internas ausente do payload do portal", !all.includes("observacoes_internas"));
    assert("12. storage_path ausente do payload do portal", !all.includes("storage_path"));
    assert("13. responsavel_id / responsavel_profile_id ausentes", !/responsavel/i.test(all));
    assert("13b. demo_batch_id ausente", !all.includes("demo_batch_id"));
    assert("13c. observacoes_internas/criado_por ausentes", !all.includes("criado_por"));
  }

  // ─── 15/17. Server-side: paginação e counts ─────────────────────────────
  {
    const p1 = (await portal(CL, { _section: "precisa_enviar", _page: 1, _page_size: 2 })).data;
    const p2 = (await portal(CL, { _section: "precisa_enviar", _page: 2, _page_size: 2 })).data;
    assert("15. page_size respeitado no servidor", p1.rows.length === 2, p1.rows.length);
    assert("15b. total > page_size (paginação real)", p1.total > 2, p1.total);
    assert("15c. página 2 traz itens diferentes",
      p1.rows.every((r) => !p2.rows.some((x) => x.item_id === r.item_id)));
    assert("15d. eco de page/page_size vem do servidor", p2.page === 2 && p2.page_size === 2, [p2.page, p2.page_size]);
    assert("17. counts globais não derivam da página (todos > rows da página)",
      p1.counts.todos > p1.rows.length, [p1.counts.todos, p1.rows.length]);
    const hist = (await portal(CL, { _section: "historico", _page_size: 2 })).data;
    assert("17b. counts idênticos entre seções (escopo global, não por seção)",
      JSON.stringify(hist.counts) === JSON.stringify(p1.counts), [hist.counts, p1.counts]);

    // filtros server-side
    const f = (await portal(CL, { _section: "precisa_enviar", _search: "bulk-3", _page_size: 100 })).data;
    assert("15e. filtro de busca aplicado no servidor", f.rows.length === 1 && f.rows[0].titulo.includes("bulk-3"),
      f.rows.map((r) => r.titulo));
    const comp = (await portal(CL, { _section: "precisa_enviar", _competencia: "1999-01", _page_size: 100 })).data;
    assert("15f. filtro de competência aplicado no servidor", comp.rows.length === 0, comp.rows.length);
    const compOk = (await portal(CL, { _section: "precisa_enviar", _competencia: "2026-06", _page_size: 100 })).data;
    assert("15g. competência existente retorna itens", compOk.rows.length > 0, compOk.rows.length);
  }

  // ─── 5. Upload muda status para recebido ────────────────────────────────
  let firstPath, firstDocId;
  {
    const target = ctx.reqAguardandoCliente;
    firstPath = `${ctx.cA}/${TAG}-upload-1.txt`;
    const up = await CL.storage.from("documents").upload(firstPath, new Blob(["arquivo 1"]), { contentType: "text/plain" });
    assert("5. cliente consegue subir arquivo no bucket documents", !up.error, up.error?.message);
    created.paths.push(firstPath);

    const ins = await CL.rpc("client_submit_document_request", {
      _request_id: target, _storage_path: firstPath, _nome: "upload-1.txt", _tipo: "outro",
    });
    assert("5b. cliente registra o documento via RPC", !ins.error, ins.error?.message);
    firstDocId = ins.data;
    if (firstDocId) created.docs.push(firstDocId);
    assert("5c. RPC devolve o id do documento criado", typeof firstDocId === "string" && firstDocId.length === 36, firstDocId);


    const { data: after } = await admin.from("document_requests").select("status, document_id").eq("id", target).single();
    assert("5d. status persistido = recebido", after.status === "recebido", after);
    assert("5e. document_id vinculado", after.document_id === firstDocId, after);

    const pe = (await portal(CL, { _section: "precisa_enviar", _page_size: 100 })).data;
    assert("5f. item sai de 'Preciso enviar' após upload", !pe.rows.some((r) => r.item_id === target));
    const hi = (await portal(CL, { _section: "historico", _page_size: 100 })).data;
    const row = hi.rows.find((r) => r.item_id === target);
    assert("5g. item aparece no Histórico como 'Em análise pela contabilidade'",
      row && row.action_owner === "staff" && /análise/i.test(row.status_label), row?.status_label);
  }

  // ─── 20. Timeline/notificações sem duplicação (upload) ──────────────────
  let tlAfterUpload;
  {
    const { data: tl } = await admin.from("timeline_events").select("id, tipo, descricao, created_at")
      .eq("client_id", ctx.cA);
    tlAfterUpload = tl ?? [];
    const key = (e) => `${e.tipo}|${e.descricao}`;
    const dupes = Object.entries(tlAfterUpload.reduce((acc, e) => { acc[key(e)] = (acc[key(e)] || 0) + 1; return acc; }, {}))
      .filter(([, n]) => n > 1);
    assert("20. nenhum evento de timeline duplicado após upload", dupes.length === 0, dupes);
    const { data: nots } = await admin.from("notifications").select("id, tipo, titulo, mensagem")
      .in("user_id", created.users);
    const ndupes = Object.entries((nots ?? []).reduce((acc, n) => {
      const k = `${n.tipo}|${n.titulo}|${n.mensagem}`; acc[k] = (acc[k] || 0) + 1; return acc;
    }, {})).filter(([, n]) => n > 1);
    assert("20b. nenhuma notificação duplicada após upload", ndupes.length === 0, ndupes);
  }

  // ─── 6/8. Reenvio ───────────────────────────────────────────────────────
  {
    const target = ctx.reqReenviar;
    // vincula um primeiro arquivo (simulando envio anterior recusado)
    const oldPath = `${ctx.cA}/${TAG}-old.txt`;
    await admin.storage.from("documents").upload(oldPath, new Blob(["antigo"]), { contentType: "text/plain" });
    created.paths.push(oldPath);
    const { data: oldDoc } = await admin.from("documents").insert({
      client_id: ctx.cA, nome: "old.txt", tipo: "outro", storage_path: oldPath, status: "recebido",
    }).select("id").single();
    created.docs.push(oldDoc.id);
    await admin.from("document_requests").update({ document_id: oldDoc.id }).eq("id", target);

    const newPath = `${ctx.cA}/${TAG}-resend.txt`;
    const up = await CL.storage.from("documents").upload(newPath, new Blob(["reenvio"]), { contentType: "text/plain" });
    assert("6. upload de reenvio aceito", !up.error, up.error?.message);
    created.paths.push(newPath);
    const ins = await CL.from("documents").insert({
      client_id: ctx.cA, nome: "resend.txt", tipo: "outro", storage_path: newPath,
      uploaded_by: ctx.clientUid, status: "recebido",
    }).select("id").single();
    assert("6b. novo documento registrado no reenvio", !ins.error, ins.error?.message);
    if (ins.data?.id) created.docs.push(ins.data.id);
    const upd = await CL.from("document_requests").update({ document_id: ins.data.id, status: "recebido" }).eq("id", target);
    assert("6c. reenvio muda status para recebido", !upd.error, upd.error?.message);
    const { data: after } = await admin.from("document_requests").select("status, document_id").eq("id", target).single();
    assert("6d. status persistido = recebido no reenvio", after.status === "recebido", after);
    assert("6e. solicitação aponta para o NOVO documento", after.document_id === ins.data.id, after);

    // 8. arquivo anterior preservado
    const { data: oldStill } = await admin.from("documents").select("id, storage_path, deleted_at").eq("id", oldDoc.id).single();
    assert("8. registro do documento anterior preservado (não apagado)",
      oldStill && oldStill.deleted_at === null, oldStill);
    const dl = await admin.storage.from("documents").download(oldPath);
    assert("8b. objeto anterior continua no storage", !dl.error && !!dl.data, dl.error?.message);
  }

  // ─── 7. Duplo clique não duplica upload ─────────────────────────────────
  {
    const target = ctx.bulk[0];
    const p = `${ctx.cA}/${TAG}-dbl.txt`;
    await CL.storage.from("documents").upload(p, new Blob(["dbl"]), { contentType: "text/plain" });
    created.paths.push(p);
    // segunda tentativa com o MESMO path (o que um duplo clique produziria dentro do mesmo ms)
    const second = await CL.storage.from("documents").upload(p, new Blob(["dbl"]), { contentType: "text/plain" });
    assert("7. segundo upload no mesmo path é rejeitado pelo storage (sem sobrescrita silenciosa)",
      !!second.error, second.error?.message ?? "sem erro");

    const { data: d } = await CL.from("documents").insert({
      client_id: ctx.cA, nome: "dbl.txt", tipo: "outro", storage_path: p,
      uploaded_by: ctx.clientUid, status: "recebido",
    }).select("id").single();
    created.docs.push(d.id);
    await CL.from("document_requests").update({ document_id: d.id, status: "recebido" }).eq("id", target);
    // update idempotente (segundo clique)
    await CL.from("document_requests").update({ document_id: d.id, status: "recebido" }).eq("id", target);
    const { data: reqRows } = await admin.from("document_requests").select("id, document_id, status").eq("id", target);
    assert("7b. solicitação permanece única e com um único vínculo",
      reqRows.length === 1 && reqRows[0].document_id === d.id && reqRows[0].status === "recebido", reqRows);
  }

  // ─── 9/10/14. Anexos e signed URLs ──────────────────────────────────────
  {
    // O portal nunca devolve storage_path: o cliente precisa buscar sob demanda.
    const { data: docRow, error: docErr } = await CL.from("documents")
      .select("storage_path").eq("id", firstDocId).is("deleted_at", null).maybeSingle();
    assert("9. cliente busca storage_path sob demanda (só do próprio documento)",
      !docErr && !!docRow?.storage_path, docErr?.message);
    const signed = await CL.storage.from("documents").createSignedUrl(docRow.storage_path, 60);
    assert("9b. signed URL criada sob demanda para documento próprio", !signed.error && !!signed.data?.signedUrl,
      signed.error?.message);

    // 14. documento de outra empresa
    const cross = await CL.from("documents").select("storage_path").eq("id", ctx.docB).maybeSingle();
    assert("14. documento de outra empresa não é legível (RLS)", !cross.data, cross.data);
    const crossSigned = await CL.storage.from("documents").createSignedUrl(`${ctx.cB}/${TAG}-b.txt`, 60);
    assert("14b. signed URL de arquivo de outra empresa é negada",
      !!crossSigned.error || !crossSigned.data?.signedUrl, crossSigned.error?.message ?? "gerou url");
  }

  // ─── 19. Rotas legadas /solicitacoes e /validades ───────────────────────
  {
    const sol = await CL.from("document_requests").select("id, titulo, status").eq("client_id", ctx.cA).limit(5);
    assert("19. consulta base de /solicitacoes segue funcionando p/ cliente", !sol.error, sol.error?.message);
    const solStaff = await A.from("document_requests").select("id, status").limit(5);
    assert("19b. /solicitacoes segue funcionando p/ staff", !solStaff.error, solStaff.error?.message);
    const val = await A.from("documents").select("id, data_validade, categoria_validade").not("data_validade", "is", null).limit(5);
    assert("19c. consulta base de /validades segue funcionando", !val.error, val.error?.message);
    const staffWs = await A.rpc("list_document_workspace_paginated", { _tab: "todos", _page: 1, _page_size: 5 });
    assert("19d. RPC staff da Fase 3/4 intacta", !staffWs.error, staffWs.error?.message);
  }

  // ─── 20b. Timeline não duplicada após reenvio ───────────────────────────
  {
    const { data: tl } = await admin.from("timeline_events").select("id, tipo, descricao").eq("client_id", ctx.cA);
    const key = (e) => `${e.tipo}|${e.descricao}`;
    const dupes = Object.entries((tl ?? []).reduce((acc, e) => { acc[key(e)] = (acc[key(e)] || 0) + 1; return acc; }, {}))
      .filter(([, n]) => n > 1);
    assert("20c. nenhum evento de timeline duplicado após reenvio", dupes.length === 0, dupes);
  }

  // ─── Asserções estáticas do código do portal ────────────────────────────
  {
    const files = {
      route: "src/routes/_authenticated/meus-documentos.tsx",
      sheet: "src/components/documentos/portal/PortalDetailSheet.tsx",
      row: "src/components/documentos/portal/PortalRow.tsx",
      hook: "src/hooks/documentos/use-client-document-portal.ts",
      filters: "src/hooks/documentos/use-client-workspace-filters.ts",
      types: "src/lib/documentos/portal-types.ts",
    };
    const src = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, readFileSync(p, "utf8")]));
    const all = Object.values(src).join("\n");

    assert("estático: listagem usa apenas a RPC do portal",
      src.hook.includes("list_client_document_workspace_paginated"));
    assert("estático: rota não consulta document_requests/documents diretamente",
      !/from\(\s*["'](document_requests|documents)["']/.test(src.route));
    assert("12b. estático: storage_path nunca renderizado em JSX",
      !/\{[^}]*storage_path[^}]*\}\s*</.test(all) && !/>\s*\{?[^<]*storage_path/.test(src.row));
    assert("12c. estático: storage_path só aparece no fetch sob demanda do sheet",
      (all.match(/storage_path/g) || []).length === (src.sheet.match(/storage_path/g) || []).length + 3,
      { total: (all.match(/storage_path/g) || []).length, sheet: (src.sheet.match(/storage_path/g) || []).length });
    assert("12d. estático: nenhum console.log com storage_path", !/console\.[a-z]+\([^)]*storage_path/.test(all));
    assert("11b. estático: observacoes_internas não referenciado no portal", !all.includes("observacoes_internas"));
    assert("13d. estático: responsavel_id/demo_batch_id não referenciados",
      !all.includes("responsavel_id") && !all.includes("demo_batch_id"));
    assert("10. estático: createSignedUrl só dentro do handler de clique (1 ocorrência)",
      (all.match(/createSignedUrl/g) || []).length === 1 && src.sheet.includes("async function openAttachment"));
    assert("10b. estático: nenhum map/forEach gerando signed URL em lote",
      !/\.(map|forEach)\([^)]*createSignedUrl/s.test(all));
    assert("7c. estático: botão de envio desabilitado enquanto pendente",
      /disabled=\{!file \|\| submit\.isPending\}/.test(src.sheet));
    assert("8c. estático: nenhuma remoção de arquivo no fluxo de reenvio",
      !/storage\.from\([^)]*\)\.remove\(/.test(all) && !all.includes(".delete()"));
    assert("16. estático: seção/página/filtros vêm da URL (useSearch)",
      src.filters.includes("useSearch") && /search\.section/.test(src.filters) && /search\.page/.test(src.filters));
    assert("16b. estático: rota valida search params (validateSearch)", src.route.includes("validateSearch"));
    assert("17c. estático: counts vêm do payload da RPC, não das rows",
      src.route.includes("portalQ.data?.counts") && !/rows\.filter\([^)]*status/.test(src.route));
    assert("15h. estático: filtros disparam patch de URL (server-side round-trip)",
      /setSearch|setCompetencia|setClient/.test(src.route) && src.hook.includes("_search"));
    assert("18. estático: layout mobile sem tabela/scroll horizontal de tabela",
      !/<table|<TableRow|overflow-x-scroll/.test(src.row + src.route));
    assert("18b. estático: linhas do portal usam Card responsivo", src.row.includes("<Card"));
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} asserções passaram.`);
  if (fails.length) {
    console.log("Falhas:", fails.map((f) => f.name));
    process.exitCode = 1;
  }
}

try {
  await run();
} catch (e) {
  console.error("ERRO FATAL:", e.message);
  process.exitCode = 1;
} finally {
  await teardown();
}
