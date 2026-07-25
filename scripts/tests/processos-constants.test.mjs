#!/usr/bin/env node
/**
 * Testes unitários — constantes/timeline/ProcessListItem do módulo Processos.
 *
 * Faixas cobertas:
 *   1) processos-constants: labels/tone para status, step-status, prioridade,
 *      request-status, opções, e fallback de valor desconhecido.
 *   2) processo-timeline-labels: visibilidade staff/client, mascaramento de
 *      eventos internos, fallback seguro para tipo desconhecido, cases-chave.
 *   3) ProcessListItem: rota do link (staff vs portal), presença dos flags
 *      (aguardando ação, sem responsável, sem prazo, progresso 0/100).
 *   4) Regressão estrutural: constantes/renderizações duplicadas removidas.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";

const results = [];
function it(name, fn) {
  try { const r = fn(); if (r && r.then) return r.then(() => { results.push({name, ok:true}); console.log("✅ " + name); }, (e)=>{ results.push({name, ok:false, err:e?.message??e}); console.log("❌ " + name + " — " + (e?.message??e)); });
    results.push({ name, ok: true }); console.log("✅ " + name);
  } catch (e) { results.push({ name, ok: false, err: e?.message ?? e }); console.log("❌ " + name + " — " + (e?.message ?? e)); }
}

async function importTs(relPath, transformSource) {
  const src = readFileSync(new URL(relPath, import.meta.url), "utf8");
  const source = transformSource ? transformSource(src) : src;
  const { code } = transformSync(source, { loader: "ts", format: "esm", target: "es2022" });
  return await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

// ─── 1) processos-constants ─────────────────────────────────────────────────
const C = await importTs("../../src/lib/processos-constants.ts");

const PROC_STATUSES = ["nao_iniciado","em_andamento","aguardando_cliente","aguardando_orgao","concluido","cancelado"];
const STEP_STATUSES = ["pendente","em_andamento","concluida","cancelada"];
const PRIORITIES = ["baixa","media","alta","urgente"];
const REQ_STATUSES = ["pendente","solicitado","em_andamento","aguardando_cliente","reenviar","recebido","concluido","recusado","cancelado"];

it("todo status técnico de processo tem label staff e client", () => {
  for (const s of PROC_STATUSES) {
    assert.ok(C.getProcessStatusLabel(s, "staff"), `staff label vazio para ${s}`);
    assert.ok(C.getProcessStatusLabel(s, "client"), `client label vazio para ${s}`);
    assert.notEqual(C.getProcessStatusLabel(s, "staff"), s, "label bruto");
  }
});
it("todo status técnico de etapa tem label staff e client", () => {
  for (const s of STEP_STATUSES) {
    assert.ok(C.getStepStatusLabel(s, "staff"));
    assert.ok(C.getStepStatusLabel(s, "client"));
  }
});
it("toda prioridade tem label", () => {
  for (const p of PRIORITIES) assert.ok(C.getPriorityLabel(p));
});
it("todo status de solicitação tem label staff e client", () => {
  for (const s of REQ_STATUSES) {
    assert.ok(C.getRequestStatusLabel(s, "staff"));
    assert.ok(C.getRequestStatusLabel(s, "client"));
  }
});
it("fallback seguro para status desconhecido (staff)", () => {
  assert.equal(C.getProcessStatusLabel("xyz_desconhecido", "staff"), "xyz_desconhecido");
  assert.equal(C.getStepStatusLabel(undefined, "staff"), "—");
  assert.equal(C.getRequestStatusLabel(null, "staff"), "—");
  assert.match(C.getProcessStatusTone("xyz", "staff"), /bg-zinc/);
});
it("labels de staff e cliente divergem quando o portal precisa", () => {
  assert.notEqual(
    C.getProcessStatusLabel("aguardando_cliente", "staff"),
    C.getProcessStatusLabel("aguardando_cliente", "client"),
  );
  assert.equal(C.getProcessStatusLabel("aguardando_cliente", "client"), "Aguardando sua ação");
});
it("nenhuma duplicidade em PROCESS_STATUS_OPTIONS", () => {
  const values = C.PROCESS_STATUS_OPTIONS.map(o => o.value);
  assert.equal(new Set(values).size, values.length);
  assert.deepEqual(values.slice().sort(), PROC_STATUSES.slice().sort());
});
it("isProcessOpen só considera concluído/cancelado como fechados", () => {
  for (const s of PROC_STATUSES) {
    const expected = s !== "concluido" && s !== "cancelado";
    assert.equal(C.isProcessOpen(s), expected);
  }
});

// ─── 2) processo-timeline-labels ────────────────────────────────────────────
const T = await importTs("../../src/lib/processo-timeline-labels.ts", (src) => {
  // Substitui import de lucide-react por stubs — evita resolução no node runtime.
  return src
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"lucide-react";?/, "")
    .replace(/type\s+LucideIcon/g, "any")
    .replace(/:\s*LucideIcon/g, "")
    .replace(/Activity|CalendarClock|CheckCircle2|FilePlus2|Paperclip|UserRound|XCircle/g, "(()=>null)")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/processos-constants";?/,
      // inline os símbolos que precisamos
      `const isProcessStatus = (v) => !!v && ["nao_iniciado","em_andamento","aguardando_cliente","aguardando_orgao","concluido","cancelado"].includes(v);
       const isStepStatus = (v) => !!v && ["pendente","em_andamento","concluida","cancelada"].includes(v);
       const PROCESS_STATUS_LOWER = { nao_iniciado:"não iniciado", em_andamento:"em andamento", aguardando_cliente:"aguardando cliente", aguardando_orgao:"aguardando órgão", concluido:"concluído", cancelado:"cancelado" };
       const STEP_STATUS_LOWER = { pendente:"pendente", em_andamento:"em andamento", concluida:"concluída", cancelada:"cancelada" };`);
});

it("evento visível ao cliente aparece para staff e cliente", () => {
  assert.ok(T.isTimelineVisible("processo_aberto", "staff"));
  assert.ok(T.isTimelineVisible("processo_aberto", "client"));
  assert.ok(T.isTimelineVisible("processo_solicitacao_criada", "client"));
});
it("evento interno é mascarado do cliente", () => {
  for (const t of [
    "processo_responsavel","processo_prazo","processo_etapa_status",
    "processo_documento_vinculado","processo_requisito_atendido",
  ]) {
    assert.equal(T.isTimelineVisible(t, "client"), false, `${t} não deveria ser visível ao cliente`);
    assert.equal(T.isTimelineVisible(t, "staff"), true, `${t} deveria ser visível ao staff`);
  }
});
it("filterVisibleTimeline remove eventos internos para o cliente", () => {
  const evts = [
    { id:1, tipo:"processo_aberto" },
    { id:2, tipo:"processo_responsavel" },
    { id:3, tipo:"processo_solicitacao_criada" },
    { id:4, tipo:"processo_documento_vinculado" },
  ];
  const staffV = T.filterVisibleTimeline(evts, "staff").map(e=>e.id);
  const clientV = T.filterVisibleTimeline(evts, "client").map(e=>e.id);
  assert.deepEqual(staffV, [1,2,3,4]);
  assert.deepEqual(clientV, [1,3]);
});
it("tipo desconhecido não vaza no portal", () => {
  const evt = { tipo: "algo_novo_interno", descricao: "detalhes internos" };
  assert.equal(T.getTimelineLabel(evt, "client"), "");
  // staff pode ver descrição como fallback
  assert.equal(T.getTimelineLabel(evt, "staff"), "detalhes internos");
});
it("label staff traduz status em minúsculas", () => {
  const evt = { tipo:"processo_status", metadata:{ old:"em_andamento", new:"concluido" } };
  assert.match(T.getTimelineLabel(evt, "staff"), /concluído/);
});
it("cliente vê Status: <novo> em processo_status", () => {
  const evt = { tipo:"processo_status", metadata:{ new:"em_andamento" } };
  assert.match(T.getTimelineLabel(evt, "client"), /Status:/);
  assert.match(T.getTimelineLabel(evt, "client"), /em andamento/);
});
it("retomada de processo aparece corretamente para staff", () => {
  const evt = { tipo:"processo_status", metadata:{ old:"aguardando_cliente", new:"em_andamento" } };
  assert.equal(T.getTimelineLabel(evt, "staff"), "Processo retomado.");
});
it("solicitação criada tem texto amigável para cliente", () => {
  const evt = { tipo:"processo_solicitacao_criada" };
  assert.match(T.getTimelineLabel(evt, "client"), /solicita/i);
});
it("getTimelineIcon devolve componente para tipos conhecidos e fallback", () => {
  const fnKnown = T.getTimelineIcon("processo_aberto");
  const fnUnknown = T.getTimelineIcon("algo_novo");
  assert.equal(typeof fnKnown, "function");
  assert.equal(typeof fnUnknown, "function");
});

// ─── 3) ProcessListItem ─────────────────────────────────────────────────────
// O componente usa JSX + imports de UI: fazemos inspeção estática do fonte.
const listItemSrc = readFileSync(new URL("../../src/components/sc/ProcessListItem.tsx", import.meta.url), "utf8");

it("staff usa rota /processos/$id", () => {
  assert.match(listItemSrc, /to="\/processos\/\$id"/);
});
it("portal usa rota /portal-processos/$id", () => {
  assert.match(listItemSrc, /to="\/portal-processos\/\$id"/);
});
it("portal exibe badge de aguardando ação condicionalmente", () => {
  assert.match(listItemSrc, /aguardandoAcao/);
  assert.match(listItemSrc, /Aguardando sua ação/);
});
it("progresso é derivado de done/total no portal", () => {
  assert.match(listItemSrc, /done\s*\/\s*total/);
});
it("responsável e prazo são renderizados condicionalmente no staff", () => {
  assert.match(listItemSrc, /p\.responsavelNome\s*&&/);
  assert.match(listItemSrc, /p\.prazoFinal\s*&&/);
});
it("aceita audience staff/client e delega para o layout correto", () => {
  assert.match(listItemSrc, /audience === "client"/);
  assert.match(listItemSrc, /StaffProcessRow/);
  assert.match(listItemSrc, /ClientProcessCard/);
});

// ─── 4) Regressão estrutural ────────────────────────────────────────────────
const filesToCheck = [
  "../../src/routes/_authenticated/processos.tsx",
  "../../src/routes/_authenticated/processos.$id.tsx",
  "../../src/routes/_authenticated/meus-processos.tsx",
  "../../src/routes/_authenticated/portal-processos.tsx",
  "../../src/routes/_authenticated/portal-processos.$id.tsx",
];

it("constantes duplicadas removidas dos principais arquivos", () => {
  for (const rel of filesToCheck) {
    const p = new URL(rel, import.meta.url);
    if (!existsSync(p)) continue;
    const src = readFileSync(p, "utf8");
    // Padrões antigos que estavam duplicados por arquivo
    assert.doesNotMatch(src, /^const STATUS_MAP\b/m, `${rel} ainda define STATUS_MAP local`);
    assert.doesNotMatch(src, /^const PRIO_MAP\b/m, `${rel} ainda define PRIO_MAP local`);
    assert.doesNotMatch(src, /^const STEP_STATUS_MAP\b/m, `${rel} ainda define STEP_STATUS_MAP local`);
    assert.doesNotMatch(src, /function friendlyTimeline\b/, `${rel} ainda define friendlyTimeline`);
    assert.doesNotMatch(src, /function friendlyEvent\b/, `${rel} ainda define friendlyEvent`);
  }
});

it("ProcessDocumentsSection não redefine REQ_STATUS_*", () => {
  const src = readFileSync(new URL("../../src/components/sc/ProcessDocumentsSection.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^const REQ_STATUS_LABEL\b/m);
  assert.doesNotMatch(src, /^const REQ_STATUS_TONE\b/m);
  assert.match(src, /getRequestStatusLabel|getRequestStatusTone/);
});

it("telas de lista usam ProcessListItem compartilhado", () => {
  for (const rel of [
    "../../src/routes/_authenticated/processos.tsx",
    "../../src/routes/_authenticated/portal-processos.tsx",
  ]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.match(src, /ProcessListItem/, `${rel} não usa ProcessListItem`);
  }
});

// ─── Resumo ─────────────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram`);
if (failed.length) { console.error(failed); process.exit(1); }
