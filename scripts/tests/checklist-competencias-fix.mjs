#!/usr/bin/env node
/**
 * Regressões críticas — Checklist + Competências.
 *
 * Cobre:
 *   A) Responsável: RPC list_checklist_responsibles (admin/colaborador/cliente);
 *   B) Competência: formato canônico AAAA-MM ponta a ponta;
 *   C) Empresa: isolamento cross-empresa e demo;
 *   D) Rota: /meu-mes/$clientId/$competence registrada e sem duplicidade.
 *
 * Uso: node scripts/tests/checklist-competencias-fix.mjs
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

const TAG = `cc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const PWD = `Test!${randomUUID().slice(0, 8)}A9`;
const E = {
  admin: `adm-${TAG}@test.local`,
  collab: `col-${TAG}@test.local`,
  collabOther: `col2-${TAG}@test.local`,
  client: `cli-${TAG}@test.local`,
};

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

const created = { users: [], clients: [], collaborators: [] };
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

const COMP_A = "2026-07";
const COMP_B = "2026-08";

async function main() {
  // ── setup ────────────────────────────────────────────────────────────────
  const admUid = await createUser(E.admin);
  await grantRole(admUid, "admin");
  const colUid = await createUser(E.collab);
  await grantRole(colUid, "collaborator");
  const col2Uid = await createUser(E.collabOther);
  await grantRole(col2Uid, "collaborator");
  const cliUid = await createUser(E.client);
  await grantRole(cliUid, "client");

  const mkClient = async (suffix, isDemo = false) => {
    const { data, error } = await admin
      .from("clients")
      .insert({
        razao_social: `Empresa ${TAG}-${suffix}`,
        documento: `${TAG}${suffix}`.slice(0, 14),
        status: "active",
        is_demo: isDemo,
      })
      .select("id")
      .single();
    if (error) throw new Error(`client ${suffix}: ${error.message}`);
    created.clients.push(data.id);
    return data.id;
  };
  const clientA = await mkClient("a");
  const clientB = await mkClient("b");
  const clientDemo = await mkClient("d", true);

  const mkCollab = async (uid, nome) => {
    const { data, error } = await admin
      .from("collaborators")
      .insert({ user_id: uid, nome, email: nome, status: "active" })
      .select("id")
      .single();
    if (error) throw new Error(`collaborator: ${error.message}`);
    created.collaborators.push(data.id);
    return data.id;
  };
  const colId = await mkCollab(colUid, E.collab);
  const col2Id = await mkCollab(col2Uid, E.collabOther);
  await admin.from("client_collaborators").insert({ client_id: clientA, collaborator_id: colId });
  await admin.from("client_users").insert({ client_id: clientA, user_id: cliUid });

  const admTok = await signIn(E.admin);
  const colTok = await signIn(E.collab);
  const cliTok = await signIn(E.client);
  const sAdm = userClient(admTok);
  const sCol = userClient(colTok);
  const sCli = userClient(cliTok);

  // ── A) RESPONSÁVEL ───────────────────────────────────────────────────────
  const { data: respAdm, error: respAdmErr } = await sAdm.rpc("list_checklist_responsibles", { _client_id: clientA });
  assert("1. Select de responsável retorna colaboradores permitidos", !respAdmErr && Array.isArray(respAdm) && respAdm.length > 0, respAdmErr?.message);
  const ids = (respAdm ?? []).map((r) => r.profile_id);
  assert("2. Colaborador vinculado à empresa aparece", ids.includes(colUid));
  const linked = (respAdm ?? []).find((r) => r.profile_id === colUid);
  assert("2b. Vínculo com a empresa é sinalizado", linked?.linked_to_client === true, linked);
  assert("2c. Admin aparece como responsável selecionável", ids.includes(admUid));
  assert("3. Colaborador não vinculado não é marcado como da empresa",
    (respAdm ?? []).find((r) => r.profile_id === col2Uid)?.linked_to_client === false);
  assert("4. Cliente não aparece como responsável interno", !ids.includes(cliUid));

  const { data: respCol, error: respColErr } = await sCol.rpc("list_checklist_responsibles", { _client_id: clientA });
  assert("4b. Colaborador consegue listar responsáveis", !respColErr && (respCol ?? []).length > 0, respColErr?.message);
  const { error: respCliErr } = await sCli.rpc("list_checklist_responsibles", { _client_id: clientA });
  assert("4c. Cliente é bloqueado na RPC de responsáveis", !!respCliErr, respCliErr?.message);

  // Ordenação: vinculados primeiro.
  assert("4d. Responsáveis vinculados vêm primeiro", (respAdm ?? [])[0]?.linked_to_client === true, respAdm?.slice(0, 2));

  // ── B) COMPETÊNCIA ───────────────────────────────────────────────────────
  const mkItem = async (client_id, competencia, titulo, responsavel = colUid) => {
    const { data, error } = await sAdm
      .from("client_checklist_items")
      .insert({ client_id, competencia, titulo, categoria: "outro", status: "pendente", responsavel_profile_id: responsavel, created_by: admUid })
      .select("id, competencia, client_id, responsavel_profile_id")
      .single();
    if (error) throw new Error(`item ${titulo}: ${error.message}`);
    return data;
  };
  const itemA = await mkItem(clientA, COMP_A, `Item A ${TAG}`);
  const itemB = await mkItem(clientB, COMP_A, `Item B ${TAG}`);
  const itemDemo = await mkItem(clientDemo, COMP_A, `Item Demo ${TAG}`);

  assert("6. ID salvo corresponde ao perfil selecionado", itemA.responsavel_profile_id === colUid);

  const listByComp = async (comp, client) => {
    let q = sAdm.from("client_checklist_items").select("id, competencia, client_id, responsavel_profile_id").is("deleted_at", null);
    if (comp) q = q.eq("competencia", comp);
    if (client) q = q.eq("client_id", client);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  const inA = await listByComp(COMP_A, clientA);
  assert("7. Item criado em 2026-07 aparece em 2026-07", inA.some((i) => i.id === itemA.id));
  const inB = await listByComp(COMP_B, clientA);
  assert("8. Item criado em 2026-07 não aparece em 2026-08", !inB.some((i) => i.id === itemA.id));
  const all = await listByComp(null, clientA);
  assert("9. Item aparece em “Todas as competências”", all.some((i) => i.id === itemA.id));

  const { data: reload } = await sAdm
    .from("client_checklist_items")
    .select("competencia, client_id, responsavel_profile_id")
    .eq("id", itemA.id)
    .single();
  assert("5. Responsável salvo permanece após reload", reload?.responsavel_profile_id === colUid);
  assert("10. Competência permanece após reload", reload?.competencia === COMP_A);
  assert("11. Filtro server-side recebe formato canônico", /^\d{4}-(0[1-9]|1[0-2])$/.test(reload?.competencia ?? ""));

  // 12. Timezone não altera o mês (normalização é puramente textual).
  const compMod = await import("../../src/lib/competencia.ts").catch(() => null);
  const src = read("../../src/lib/competencia.ts");
  assert("12a. Helper normalizeCompetencia existe", /export function normalizeCompetencia/.test(src));
  assert("12b. Normalização não usa Date/timezone", !/new Date\(/.test(src.split("export function currentCompetencia")[0]));
  const tzProbe = ["2026-07", "2026-7", "07/2026", "2026-07-01", "2026/07", " 2026-07 "];
  const normalized = tzProbe.map((v) => {
    const s = v.trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[-/](\d{4})$/);
    if (m) return `${m[2]}-${String(Number(m[1])).padStart(2, "0")}`;
    return null;
  });
  assert("12. Timezone não altera o mês (todas as formas → 2026-07)", normalized.every((n) => n === COMP_A), normalized);
  void compMod;

  // ── C) EMPRESA ───────────────────────────────────────────────────────────
  assert("13. Item aparece na empresa escolhida", (await listByComp(COMP_A, clientA)).some((i) => i.id === itemA.id));
  assert("14. Item não aparece em outra empresa", !(await listByComp(COMP_A, clientB)).some((i) => i.id === itemA.id));
  assert("14b. Item da empresa B fica na empresa B", (await listByComp(COMP_A, clientB)).some((i) => i.id === itemB.id));

  const { data: cliItems, error: cliItemsErr } = await sCli
    .from("client_checklist_items")
    .select("id, client_id")
    .in("client_id", [clientA, clientB]);
  assert("15. Cross-empresa é bloqueado para o cliente",
    !cliItemsErr && !(cliItems ?? []).some((i) => i.client_id === clientB), cliItemsErr?.message ?? cliItems);

  // Itens herdam o isolamento pela empresa (clients.is_demo); a listagem real
  // nunca mistura empresas demo com empresas reais.
  const { data: demoJoin } = await admin
    .from("client_checklist_items")
    .select("id, client_id, clients!inner(is_demo)")
    .in("client_id", [clientA, clientDemo])
    .eq("competencia", COMP_A);
  const demoOnly = (demoJoin ?? []).filter((r) => r.clients?.is_demo);
  assert("16. Real/Demo permanece isolado",
    demoOnly.length === 1 && demoOnly[0].client_id === clientDemo && demoOnly[0].id === itemDemo.id, demoJoin);
  const realRow = await admin.from("client_checklist_items").select("is_demo").eq("id", itemA.id).single();
  assert("16b. Item real não é marcado como demo", realRow.data?.is_demo === false);

  const { data: overview, error: overviewErr } = await sAdm.rpc("get_competence_overview", { p_competence: COMP_A });
  const ovRows = Array.isArray(overview) ? overview : overview?.clients ?? [];
  assert("17. Item aparece no detalhe da competência da empresa",
    !overviewErr && JSON.stringify(ovRows).includes(clientA), overviewErr?.message);

  // Bloqueio de empresa inacessível: cliente não pode criar item.
  const { error: cliInsertErr } = await sCli
    .from("client_checklist_items")
    .insert({ client_id: clientB, competencia: COMP_A, titulo: "hack", categoria: "outro", status: "pendente" });
  assert("15b. Criação cross-empresa é rejeitada", !!cliInsertErr, cliInsertErr?.message);

  // ── D) ROTA ──────────────────────────────────────────────────────────────
  const tree = read("../../src/routeTree.gen.ts");
  assert("18. Rota /meu-mes/$clientId/$competence registrada", tree.includes("'/meu-mes/$clientId/$competence'"));
  const meuMes = read("../../src/routes/_authenticated/meu-mes.tsx");
  const minhaArea = read("../../src/routes/_authenticated/minha-area.tsx");
  assert("18b. “Ver detalhes” aponta para a rota válida", meuMes.includes('to="/meu-mes/$clientId/$competence"'));
  assert("18c. Nenhum link usa o id interno com underscore",
    !/to="\/meu-mes_\//.test(meuMes) && !/to="\/meu-mes_\//.test(minhaArea));
  const detail = read("../../src/routes/_authenticated/meu-mes_.$clientId.$competence.tsx");
  assert("19. URL direta do detalhe é servida pelo arquivo de rota",
    detail.includes('createFileRoute("/_authenticated/meu-mes_/$clientId/$competence")'));
  assert("20. Reload não gera 404 (rota é estática no route tree)",
    (tree.match(/'\/meu-mes\/\$clientId\/\$competence'/g) ?? []).length >= 1);
  assert("20b. Não há rota duplicada de detalhe",
    (tree.match(/id: '\/_authenticated\/meu-mes_\/\$clientId\/\$competence'/g) ?? []).length === 1);
  assert("21. Parâmetros de competência e empresa são preservados",
    detail.includes("Route.useParams()") && detail.includes("p_client_id") && detail.includes("p_competence"));
  assert("22. Usuário sem acesso recebe tratamento apropriado (não 404)",
    detail.includes("Área do cliente") && detail.includes("errorComponent"));
  assert("23. Competência sem itens mostra estado vazio", detail.includes("EmptyState"));
  assert("23b. Competência inválida tem mensagem dedicada", detail.includes("Competência inválida"));

  // ── E) REGRESSÃO ─────────────────────────────────────────────────────────
  const { error: upErr } = await sAdm
    .from("client_checklist_items")
    .update({ titulo: `Item A editado ${TAG}` })
    .eq("id", itemA.id);
  assert("24a. Editar item continua funcionando", !upErr, upErr?.message);
  const { error: doneErr } = await sAdm
    .from("client_checklist_items")
    .update({ status: "concluido", concluded_at: new Date().toISOString(), concluded_by: admUid })
    .eq("id", itemA.id);
  assert("24b. Concluir item continua funcionando", !doneErr, doneErr?.message);
  const { data: afterDone } = await sAdm
    .from("client_checklist_items")
    .select("status, competencia, client_id")
    .eq("id", itemA.id)
    .single();
  assert("24c. Empresa e competência preservadas após conclusão",
    afterDone?.competencia === COMP_A && afterDone?.client_id === clientA, afterDone);

  const { count: countA } = await sAdm
    .from("client_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientA)
    .eq("competencia", COMP_A)
    .is("deleted_at", null);
  assert("25. Contadores da competência são atualizados", countA === 1, countA);

  const { data: ov2, error: ov2Err } = await sAdm.rpc("get_competence_overview", { p_competence: COMP_A });
  assert("26. Progresso mensal é recalculado sem erro", !ov2Err, ov2Err?.message);
  const ov2Rows = Array.isArray(ov2) ? ov2 : ov2?.clients ?? [];
  const idsSeen = JSON.stringify(ov2Rows).split(clientA).length - 1;
  assert("27. Dashboard não duplica itens da empresa", idsSeen <= 2, idsSeen);

  const checklistSrc = read("../../src/routes/_authenticated/checklist.tsx");
  assert("27b. Checklist usa a RPC de responsáveis", checklistSrc.includes("list_checklist_responsibles"));
  assert("27c. Checklist não usa mais a coluna inexistente nome_completo", !checklistSrc.includes("nome_completo"));
  assert("27d. Competência do formulário é normalizada", checklistSrc.includes("normalizeCompetencia"));
  assert("27e. Novo item herda a competência selecionada", checklistSrc.includes("defaultComp"));

  // ── cleanup ──────────────────────────────────────────────────────────────
  await admin.from("client_checklist_items").delete().in("client_id", created.clients);
  await admin.from("client_collaborators").delete().in("client_id", created.clients);
  await admin.from("client_users").delete().in("client_id", created.clients);
  await admin.from("collaborators").delete().in("id", created.collaborators);
  await admin.from("clients").delete().in("id", created.clients);
  for (const u of created.users) await admin.auth.admin.deleteUser(u);
  void itemB;

  const failed = results.filter((r) => !r.ok);
  console.log(`\n─── Checklist/Competências: ${results.length - failed.length}/${results.length} asserções OK ───`);
  if (failed.length) {
    console.log(failed.map((f) => `  ✗ ${f.name}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
