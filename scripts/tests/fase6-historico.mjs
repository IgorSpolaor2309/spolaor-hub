#!/usr/bin/env node
/**
 * Validação da FASE 6 — Histórico 1:N de arquivos, conclusão automática de
 * checklist/requisito, reaproveitamento de documentos e whitelists de leitura.
 *
 * Uso: node scripts/tests/fase6-historico.mjs
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

const TAG = `f6-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = { admin: `adm-${TAG}@test.local`, client: `cli-${TAG}@test.local` };

const results = [];
function assert(name, cond, extra) {
  const ok = !!cond;
  results.push({ name, ok, extra: ok ? undefined : extra });
  console.log(
    `${ok ? "✅" : "❌"} ${name}${!ok && extra !== undefined ? " — " + JSON.stringify(extra).slice(0, 300) : ""}`,
  );
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

const created = { users: [], clients: [], paths: [] };

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
      status: patch.status ?? "aguardando",
      criado_por_role: "staff",
      urgencia: "normal",
      competencia: patch.competencia ?? "2026-06",
      tipo_solicitacao: patch.tipo ?? "outro",
    })
    .select("id")
    .single();
  if (error) throw new Error(`mkReq(${patch.titulo}): ${error.message}`);
  return data.id;
}
async function upload(clientId, name) {
  const path = `${clientId}/${TAG}-${name}`;
  const { error } = await admin.storage
    .from("documents")
    .upload(path, new Blob([`conteudo ${name}`]), { contentType: "text/plain" });
  if (error) throw new Error(`upload ${name}: ${error.message}`);
  created.paths.push(path);
  return path;
}
async function mkDoc(clientId, name, extra = {}) {
  const path = await upload(clientId, name);
  const { data, error } = await admin
    .from("documents")
    .insert({
      client_id: clientId,
      nome: name,
      tipo: "outro",
      status: "recebido",
      storage_path: path,
      competencia: "2026-06",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(`mkDoc ${name}: ${error.message}`);
  return { id: data.id, path };
}

const ctx = {};

async function setup() {
  ctx.adminId = await createUser(E.admin);
  ctx.clientUid = await createUser(E.client);
  await grantRole(ctx.adminId, "admin");
  await grantRole(ctx.clientUid, "client");

  ctx.cA = await mkClient(`${TAG} Empresa A`);
  ctx.cB = await mkClient(`${TAG} Empresa B`);
  const { error } = await admin
    .from("client_users")
    .insert({ client_id: ctx.cA, user_id: ctx.clientUid, ativo: true, papel: "titular" });
  if (error) throw new Error(`client_users: ${error.message}`);

  ctx.tokAdmin = await signIn(E.admin);
  ctx.tokClient = await signIn(E.client);
  ctx.AD = userClient(ctx.tokAdmin);
  ctx.CL = userClient(ctx.tokClient);
}

async function teardown() {
  try {
    for (const c of created.clients) {
      await admin.from("document_request_files").delete().eq("client_id", c);
      await admin.from("document_request_link_issues").delete().eq("client_id", c);
      await admin.from("client_checklist_items").delete().eq("client_id", c);
      await admin.from("documents").delete().eq("client_id", c);
      await admin.from("document_requests").delete().eq("client_id", c);
      await admin.from("timeline_events").delete().eq("client_id", c);
      await admin.from("client_users").delete().eq("client_id", c);
      await admin.from("clients").delete().eq("id", c);
    }
    if (created.paths.length) await admin.storage.from("documents").remove(created.paths);
    for (const u of created.users) await admin.auth.admin.deleteUser(u);
  } catch (e) {
    console.warn("teardown parcial:", e.message);
  }
}

async function run() {
  await setup();

  // ------------------------------------------------------------------
  // A. HISTÓRICO 1:N — primeiro envio + reenvios
  // ------------------------------------------------------------------
  const req = await mkReq(ctx.cA, { titulo: "historico" });
  const p1 = `${ctx.cA}/${TAG}-v1.txt`;
  await admin.storage.from("documents").upload(p1, new Blob(["v1"]), { contentType: "text/plain" });
  created.paths.push(p1);
  const s1 = await ctx.CL.rpc("client_submit_document_request", {
    _request_id: req, _storage_path: p1, _nome: "v1.txt", _tipo: "outro",
  });
  assert("A1. cliente envia arquivo (v1)", !s1.error, s1.error?.message);

  let { data: dr } = await admin.from("document_requests").select("status, document_id").eq("id", req).single();
  assert("A2. status vai para 'recebido' após envio", dr.status === "recebido", dr.status);

  // reenvio: staff pede reenviar, cliente envia v2
  await admin.from("document_requests").update({ status: "reenviar" }).eq("id", req);
  const p2 = `${ctx.cA}/${TAG}-v2.txt`;
  await admin.storage.from("documents").upload(p2, new Blob(["v2"]), { contentType: "text/plain" });
  created.paths.push(p2);
  const s2 = await ctx.CL.rpc("client_submit_document_request", {
    _request_id: req, _storage_path: p2, _nome: "v2.txt", _tipo: "outro",
  });
  assert("A3. cliente reenvia arquivo (v2)", !s2.error, s2.error?.message);
  ({ data: dr } = await admin.from("document_requests").select("status, document_id").eq("id", req).single());
  assert("A4. reenvio volta o status para 'recebido'", dr.status === "recebido", dr.status);

  const { data: files } = await admin
    .from("document_request_files")
    .select("id, version_number, active, submission_type, submitted_by_role, document_id")
    .eq("document_request_id", req)
    .order("version_number");
  assert("A5. histórico guarda 2 versões (nada é sobrescrito)", (files ?? []).length === 2, files?.length);
  assert("A6. versões numeradas 1 e 2", files?.[0]?.version_number === 1 && files?.[1]?.version_number === 2);
  assert("A7. apenas uma versão ativa", (files ?? []).filter((f) => f.active).length === 1);
  assert("A8. a versão ativa é a mais recente", files?.[1]?.active === true);
  assert("A9. document_id da solicitação aponta para a versão ativa", dr.document_id === files?.[1]?.document_id);
  assert("A10. tipo de envio classificado (original/reenvio)",
    files?.[0]?.submission_type === "original" && files?.[1]?.submission_type === "reenvio",
    files?.map((f) => f.submission_type));
  assert("A11. papel do remetente registrado como client",
    files?.every((f) => f.submitted_by_role === "client"));

  // idempotência: mesmo arquivo enviado duas vezes não duplica versão
  const again = await ctx.CL.rpc("client_submit_document_request", {
    _request_id: req, _storage_path: p2, _nome: "v2.txt", _tipo: "outro",
  });
  const { count: cAgain } = await admin
    .from("document_request_files")
    .select("id", { count: "exact", head: true })
    .eq("document_request_id", req);
  assert("A12. reenvio idêntico é idempotente (não cria versão duplicada)",
    !again.error && cAgain === 2, { err: again.error?.message, cAgain });

  // ------------------------------------------------------------------
  // B. HISTÓRICO NUNCA É APAGADO
  // ------------------------------------------------------------------
  const delTry = await admin.from("document_request_files").delete().eq("id", files[0].id);
  const { count: afterDel } = await admin
    .from("document_request_files")
    .select("id", { count: "exact", head: true })
    .eq("document_request_id", req);
  assert("B1. DELETE de versão é bloqueado no banco", !!delTry.error || afterDel === 2,
    { err: delTry.error?.message, afterDel });

  const clientDel = await ctx.CL.from("document_request_files").delete().eq("id", files[1].id);
  assert("B2. cliente não consegue apagar versão", !!clientDel.error || clientDel.count !== 1);

  // ------------------------------------------------------------------
  // C. STAFF — RPCs de histórico e definição de versão atual
  // ------------------------------------------------------------------
  const hStaff = await ctx.AD.rpc("list_document_request_files_staff", { _request_id: req });
  assert("C1. staff lê o histórico via RPC", !hStaff.error && (hStaff.data ?? []).length === 2, hStaff.error?.message);
  const staffKeys = Object.keys(hStaff.data?.[0] ?? {});
  assert("C2. histórico staff não expõe storage_path", !staffKeys.includes("storage_path"), staffKeys);

  const setActive = await ctx.AD.rpc("staff_set_active_request_file", { _file_id: files[0].id });
  assert("C3. admin pode restaurar versão anterior como atual", !setActive.error, setActive.error?.message);
  const { data: afterSet } = await admin
    .from("document_request_files")
    .select("id, active")
    .eq("document_request_id", req);
  assert("C4. continua havendo exatamente uma versão ativa",
    afterSet.filter((f) => f.active).length === 1);
  const { data: drAfter } = await admin.from("document_requests").select("document_id").eq("id", req).single();
  assert("C5. document_id acompanha a versão restaurada", drAfter.document_id === files[0].document_id);

  const clientSet = await ctx.CL.rpc("staff_set_active_request_file", { _file_id: files[1].id });
  assert("C6. cliente não pode alterar a versão atual", !!clientSet.error, clientSet.error?.message);

  // ------------------------------------------------------------------
  // D. CLIENTE — histórico com whitelist reduzida
  // ------------------------------------------------------------------
  const hCli = await ctx.CL.rpc("list_document_request_files_client", { _request_id: req });
  assert("D1. cliente lê o próprio histórico", !hCli.error && (hCli.data ?? []).length >= 2, hCli.error?.message);
  const cliKeys = Object.keys(hCli.data?.[0] ?? {});
  assert("D2. histórico do cliente não expõe storage_path", !cliKeys.includes("storage_path"), cliKeys);
  assert("D3. histórico do cliente não expõe campos internos",
    !cliKeys.some((k) => ["observacoes_internas", "demo_batch_id", "submitted_by"].includes(k)), cliKeys);

  const reqB = await mkReq(ctx.cB, { titulo: "outra-empresa" });
  const hCross = await ctx.CL.rpc("list_document_request_files_client", { _request_id: reqB });
  assert("D4. cliente não lê histórico de outra empresa",
    !!hCross.error || (hCross.data ?? []).length === 0, hCross.error?.message);

  // ------------------------------------------------------------------
  // E. ACESSO A ARQUIVO — can_user_access_document
  // ------------------------------------------------------------------
  const okAccess = await ctx.CL.rpc("can_user_access_document", { _user_id: ctx.clientUid, _document_id: files[0].document_id });
  assert("E1. cliente tem acesso ao próprio documento", okAccess.data === true, okAccess.error?.message);
  const docB = await mkDoc(ctx.cB, "docB.txt");
  const noAccess = await ctx.CL.rpc("can_user_access_document", { _user_id: ctx.clientUid, _document_id: docB.id });
  assert("E2. cliente NÃO tem acesso a documento de outra empresa",
    noAccess.data === false || !!noAccess.error, noAccess.data);
  const admAccess = await ctx.AD.rpc("can_user_access_document", { _user_id: ctx.adminId, _document_id: docB.id });
  assert("E3. admin tem acesso a documento de qualquer empresa", admAccess.data === true, admAccess.error?.message);

  // ------------------------------------------------------------------
  // F. CONCLUSÃO AUTOMÁTICA DE CHECKLIST
  // ------------------------------------------------------------------
  const reqCk = await mkReq(ctx.cA, { titulo: "checklist-link", competencia: "2026-07" });
  const { data: ck, error: ckErr } = await admin
    .from("client_checklist_items")
    .insert({
      client_id: ctx.cA,
      titulo: `${TAG} item`,
      categoria: "fiscal",
      competencia: "2026-07",
      status: "pendente",
      origem: "manual",
      document_request_id: reqCk,
    })
    .select("id")
    .single();
  if (ckErr) throw new Error(`checklist: ${ckErr.message}`);

  const pCk = await upload(ctx.cA, "ck.txt");
  await ctx.CL.rpc("client_submit_document_request", {
    _request_id: reqCk, _storage_path: pCk, _nome: "ck.txt", _tipo: "outro",
  });
  await admin.from("document_requests").update({ status: "concluido" }).eq("id", reqCk);
  const { data: ckAfter } = await admin
    .from("client_checklist_items")
    .select("status, concluded_at, document_id")
    .eq("id", ck.id)
    .single();
  assert("F1. concluir a solicitação conclui o checklist vinculado", ckAfter.status === "concluido", ckAfter.status);
  assert("F2. checklist recebe data de conclusão", !!ckAfter.concluded_at);
  assert("F3. checklist recebe o documento ativo", !!ckAfter.document_id);

  // não deve concluir checklist de outra empresa/competência
  const { data: ckOther } = await admin
    .from("client_checklist_items")
    .insert({
      client_id: ctx.cB, titulo: `${TAG} outro`, categoria: "fiscal",
      competencia: "2026-07", status: "pendente", origem: "manual",
    })
    .select("id")
    .single();
  const { data: ckOtherAfter } = await admin
    .from("client_checklist_items").select("status").eq("id", ckOther.id).single();
  assert("F4. checklist de outra empresa permanece pendente", ckOtherAfter.status === "pendente");

  // ------------------------------------------------------------------
  // G. REAPROVEITAMENTO DE DOCUMENTO EXISTENTE
  // ------------------------------------------------------------------
  const existing = await mkDoc(ctx.cA, "reuso.txt");
  const reqReuse = await mkReq(ctx.cA, { titulo: "reuso" });
  const attach = await ctx.AD.rpc("staff_attach_document_to_request", {
    _request_id: reqReuse, _document_id: existing.id, _submission_type: "reaproveitado",
  });
  assert("G1. staff reaproveita documento existente da mesma empresa", !attach.error, attach.error?.message);
  const { data: reuseFiles } = await admin
    .from("document_request_files")
    .select("submission_type, submitted_by_role, active, document_id")
    .eq("document_request_id", reqReuse);
  assert("G2. reaproveitamento entra no histórico como versão", (reuseFiles ?? []).length === 1);
  assert("G3. reaproveitamento marcado com o tipo correto",
    reuseFiles?.[0]?.submission_type === "reaproveitado", reuseFiles?.[0]?.submission_type);
  assert("G4. reaproveitamento não duplica o arquivo (mesmo document_id)",
    reuseFiles?.[0]?.document_id === existing.id);
  const { count: docCount } = await admin
    .from("documents").select("id", { count: "exact", head: true }).eq("storage_path", existing.path);
  assert("G5. nenhum documento duplicado no storage/tabela", docCount === 1, docCount);

  const attachCross = await ctx.AD.rpc("staff_attach_document_to_request", {
    _request_id: reqReuse, _document_id: docB.id, _submission_type: "reaproveitado",
  });
  assert("G6. reaproveitar documento de outra empresa é bloqueado", !!attachCross.error, attachCross.error?.message);
  const clientAttach = await ctx.CL.rpc("staff_attach_document_to_request", {
    _request_id: reqReuse, _document_id: existing.id, _submission_type: "reaproveitado",
  });
  assert("G7. cliente não pode usar a função de reaproveitamento", !!clientAttach.error);

  const search = await ctx.AD.rpc("search_client_documents_paginated", {
    _client_id: ctx.cA, _search: "reuso", _page: 1, _page_size: 10,
  });
  assert("G8. busca paginada de documentos reaproveitáveis funciona",
    !search.error && Array.isArray(search.data?.rows ?? search.data), search.error?.message);
  const searchRows = search.data?.rows ?? search.data ?? [];
  assert("G9. busca não devolve storage_path",
    !Object.keys(searchRows[0] ?? {}).includes("storage_path"), Object.keys(searchRows[0] ?? {}));
  const searchCross = await ctx.CL.rpc("search_client_documents_paginated", {
    _client_id: ctx.cB, _search: "", _page: 1, _page_size: 10,
  });
  assert("G10. cliente não busca documentos de outra empresa", !!searchCross.error);

  // ------------------------------------------------------------------
  // H. WHITELISTS DE LEITURA (MCP)
  // ------------------------------------------------------------------
  const cliDocs = await ctx.CL.rpc("client_list_documents", {
    p_client_id: ctx.cA, p_competencia: null, p_limit: 20, p_offset: 0,
  });
  assert("H1. cliente lista documentos da própria empresa", !cliDocs.error, cliDocs.error?.message);
  const docKeys = Object.keys(cliDocs.data?.[0] ?? {});
  assert("H2. lista de documentos do cliente não expõe storage_path/observações",
    !docKeys.includes("storage_path") && !docKeys.includes("observacoes"), docKeys);
  const cliDocsCross = await ctx.CL.rpc("client_list_documents", {
    p_client_id: ctx.cB, p_competencia: null, p_limit: 20, p_offset: 0,
  });
  assert("H3. cliente não lista documentos de outra empresa", !!cliDocsCross.error);

  const detStaff = await ctx.AD.rpc("get_document_request_details_staff", { _request_id: req });
  assert("H4. detalhe staff inclui histórico de versões",
    !detStaff.error && Array.isArray(detStaff.data?.versoes) && detStaff.data.versoes.length === 2,
    detStaff.error?.message);
  assert("H5. detalhe staff não devolve storage_path",
    !JSON.stringify(detStaff.data ?? {}).includes("storage_path"));

  const detCli = await ctx.CL.rpc("get_document_request_details_client", { _request_id: req });
  assert("H6. detalhe cliente funciona", !detCli.error, detCli.error?.message);
  assert("H7. detalhe cliente não expõe observações internas",
    !("observacoes_internas" in (detCli.data ?? {})), Object.keys(detCli.data ?? {}));
  const detCross = await ctx.CL.rpc("get_document_request_details_client", { _request_id: reqB });
  assert("H8. detalhe cliente bloqueia outra empresa", !!detCross.error);
  const detStaffAsClient = await ctx.CL.rpc("get_document_request_details_staff", { _request_id: req });
  assert("H9. cliente não acessa o detalhe de staff", !!detStaffAsClient.error);

  // ------------------------------------------------------------------
  // I. ASSERÇÕES ESTÁTICAS
  // ------------------------------------------------------------------
  {
    const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const portal = strip(read("src/components/documentos/portal/PortalDetailSheet.tsx"));
    const history = strip(read("src/components/documentos/workspace/RequestFileHistory.tsx"));
    const reuse = strip(read("src/components/documentos/workspace/ReuseDocumentDialog.tsx"));
    const sheet = strip(read("src/components/documentos/workspace/DocumentWorkspaceDetailSheet.tsx"));
    const fn = strip(read("src/lib/documentos/files.functions.ts"));
    const mcpDocs = strip(read("src/lib/mcp/tools/list-documents.ts"));
    const mcpDet = strip(read("src/lib/mcp/tools/get-document-request-details.ts"));

    assert("I1. Portal não faz SELECT de storage_path", !/select\(\s*["'`][^"'`]*storage_path/.test(portal));
    assert("I2. Portal usa a server function segura de URL", portal.includes("useDocumentFileUrl"));
    assert("I3. Server function valida acesso antes de assinar",
      fn.includes("can_user_access_document") && fn.includes("requireSupabaseAuth"));
    assert("I4. Server function não devolve storage_path ao navegador",
      !/return\s*\{[^}]*storage_path/.test(fn));
    assert("I5. Histórico staff renderizado no sheet", sheet.includes("RequestFileHistory"));
    assert("I6. Reaproveitamento disponível no sheet", sheet.includes("ReuseDocumentDialog"));
    assert("I7. Histórico não referencia storage_path", !history.includes("storage_path"));
    assert("I8. Reaproveitamento não referencia storage_path", !reuse.includes("storage_path"));
    assert("I9. Restaurar versão exige confirmação (AlertDialog)", history.includes("AlertDialog"));
    assert("I10. Nenhuma remoção de arquivo nos componentes novos",
      !/storage\.from\([^)]*\)\.remove\(/.test(history + reuse + portal));
    assert("I11. MCP list_documents não seleciona storage_path", !mcpDocs.includes("storage_path"));
    assert("I12. MCP list_documents usa whitelist explícita", mcpDocs.includes("STAFF_FIELDS"));
    assert("I13. MCP detalhe usa RPC distinta por papel",
      mcpDet.includes("get_document_request_details_staff") &&
      mcpDet.includes("get_document_request_details_client"));
    assert("I14. MCP novas tools são somente leitura",
      /readOnlyHint:\s*true/.test(mcpDocs) && /readOnlyHint:\s*true/.test(mcpDet));
    assert("I15. MCP novas tools passam pelo wrapper de auditoria",
      mcpDocs.includes("withMcpAudit") && mcpDet.includes("withMcpAudit"));
    const index = read("src/lib/mcp/index.ts");
    assert("I16. novas tools registradas no servidor MCP",
      index.includes("listDocumentsTool") && index.includes("getDocumentRequestDetailsTool"));
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
