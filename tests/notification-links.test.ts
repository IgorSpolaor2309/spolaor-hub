import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Fase C3.2 — testes de contrato dos links das notificações de documentos.
 *
 * Fonte de verdade: a migration que redefine `on_document_request_change()` e
 * `on_document_insert_notify()`. Os testes leem os literais de link presentes
 * nas funções e validam perfil, rota, parâmetros e aderência às abas/seções
 * realmente existentes nas RPCs de listagem.
 */

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260730215210_0ec2c348-d4fd-4989-906b-ab0501182f5a.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

/** Parâmetros aceitos pelo validateSearch de /documentos (staff). */
const STAFF_PARAMS = new Set([
  "tab", "page", "page_size", "q", "client", "comp", "categoria", "tipo", "dep",
  "status", "owner", "resp", "origem", "prazo_from", "prazo_to", "val_from",
  "val_to", "tem_doc", "tem_link", "meus", "demo", "demo_batch",
]);

/** Parâmetros aceitos pelo validateSearch de /meus-documentos (cliente). */
const PORTAL_PARAMS = new Set([
  "section", "page", "page_size", "q", "client", "comp", "demo", "item",
]);

/** Abas que a RPC de staff realmente filtra. */
const STAFF_TABS = new Set([
  "todos", "aguardando_cliente", "recebidos", "reenviar", "concluidos",
  "vinculados", "vencendo", "vencidos",
]);

/** Seções aceitas pela RPC do portal. */
const PORTAL_SECTIONS = new Set(["precisa_enviar", "historico"]);

type Link = { raw: string; path: string; params: string[] };

function extractLinks(fnName: string): Link[] {
  const start = sql.indexOf(`FUNCTION public.${fnName}(`);
  expect(start, `função ${fnName} presente na migration`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.indexOf("$function$;");
  const body = rest.slice(0, end === -1 ? undefined : end);
  const found = body.match(/'\/[a-z0-9\-?&=_]+'/g) ?? [];
  return found.map((lit) => {
    const raw = lit.slice(1, -1);
    const [path, query = ""] = raw.split("?");
    const params = query
      .split("&")
      .filter(Boolean)
      .map((p) => p.split("=")[0]);
    return { raw, path, params };
  });
}

const requestLinks = extractLinks("on_document_request_change");
const insertLinks = extractLinks("on_document_insert_notify");
const allLinks = [...requestLinks, ...insertLinks];

describe("C3.2 — links de notificação: rotas legadas", () => {
  it("nenhum link novo aponta para /solicitacoes ou /validades", () => {
    for (const l of allLinks) {
      expect(l.path).not.toBe("/solicitacoes");
      expect(l.path).not.toBe("/validades");
    }
  });

  it("todos os links usam apenas as duas rotas oficiais", () => {
    for (const l of allLinks) {
      expect(["/documentos", "/meus-documentos"]).toContain(l.path);
    }
  });

  it("existem links para os dois perfis na função de solicitações", () => {
    expect(requestLinks.some((l) => l.path === "/documentos")).toBe(true);
    expect(requestLinks.some((l) => l.path === "/meus-documentos")).toBe(true);
  });
});

describe("C3.2 — isolamento por perfil", () => {
  it("staff nunca recebe link para /meus-documentos", () => {
    const staffBranches = sql.match(/client_staff_user_ids[\s\S]{0,400}?END LOOP/g) ?? [];
    expect(staffBranches.length).toBeGreaterThan(0);
    for (const b of staffBranches) expect(b).not.toContain("/meus-documentos");
  });

  it("cliente nunca recebe link para /documentos", () => {
    // Toda atribuição de link em ramo de cliente usa /meus-documentos.
    const clientAssignments = sql.match(/'\/meus-documentos[^']*'/g) ?? [];
    expect(clientAssignments.length).toBeGreaterThan(0);
    const clientLoops = sql.match(/FOR v_user IN SELECT public\.client_user_ids[\s\S]{0,300}?END LOOP/g) ?? [];
    expect(clientLoops.length).toBeGreaterThan(0);
    for (const b of clientLoops) expect(b).not.toContain("'/documentos");
  });
});

describe("C3.2 — parâmetros aceitos pelo validateSearch", () => {
  it("links de staff só usam parâmetros de /documentos", () => {
    for (const l of allLinks.filter((x) => x.path === "/documentos")) {
      for (const p of l.params) expect(STAFF_PARAMS.has(p), `${p} em ${l.raw}`).toBe(true);
    }
  });

  it("links do portal só usam parâmetros de /meus-documentos", () => {
    for (const l of allLinks.filter((x) => x.path === "/meus-documentos")) {
      for (const p of l.params) expect(PORTAL_PARAMS.has(p), `${p} em ${l.raw}`).toBe(true);
    }
  });

  it("item aparece somente no Portal", () => {
    for (const l of allLinks) {
      if (l.path === "/documentos") expect(l.params).not.toContain("item");
    }
    expect(
      allLinks.filter((l) => l.path === "/meus-documentos").every((l) => l.params.includes("item")),
    ).toBe(true);
  });

  it("todo link inclui client (cliente pode ter várias empresas)", () => {
    for (const l of allLinks) expect(l.params, l.raw).toContain("client");
  });

  it("comp é anexado condicionalmente, nunca embutido no literal", () => {
    for (const l of allLinks) expect(l.params).not.toContain("comp");
    expect(sql).toMatch(/v_comp\s*:=\s*CASE WHEN NULLIF\(btrim\(COALESCE\(NEW\.competencia/);
    expect(sql).toContain("THEN '' ELSE '&comp=' || btrim(NEW.competencia) END");
    expect(sql).not.toContain("comp=null");
    expect(sql).not.toContain("comp=undefined");
  });

  it("separadores de query são válidos", () => {
    for (const l of allLinks) {
      expect(l.raw).not.toContain("??");
      expect(l.raw).not.toContain("&&");
      expect(l.raw.endsWith("&") || l.raw.endsWith("?")).toBe(false);
      expect(l.raw.split("?").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("C3.2 — abas e seções existem e comportam o status", () => {
  it("todas as abas de staff usadas existem na RPC", () => {
    for (const l of allLinks.filter((x) => x.path === "/documentos")) {
      const tab = l.raw.match(/[?&]tab=([a-z_]+)/)?.[1];
      expect(tab, l.raw).toBeTruthy();
      expect(STAFF_TABS.has(tab!), tab).toBe(true);
    }
  });

  it("todas as seções do portal usadas existem na RPC", () => {
    for (const l of allLinks.filter((x) => x.path === "/meus-documentos")) {
      const section = l.raw.match(/[?&]section=([a-z_]+)/)?.[1];
      if (section) expect(PORTAL_SECTIONS.has(section), section).toBe(true);
    }
  });

  it("status recebido → aba recebidos (item_kind=document_request)", () => {
    const branch = sql.slice(sql.indexOf("ELSIF NEW.status = 'recebido'"));
    expect(branch.slice(0, 200)).toContain("/documentos?tab=recebidos&client=");
  });

  it("status concluido → histórico do portal", () => {
    const branch = sql.slice(sql.indexOf("ELSIF NEW.status = 'concluido'"));
    expect(branch.slice(0, 220)).toContain("/meus-documentos?section=historico&client=");
  });

  it("status reenviar → precisa_enviar do portal", () => {
    const branch = sql.slice(sql.indexOf("IF NEW.status = 'reenviar'"));
    expect(branch.slice(0, 220)).toContain("/meus-documentos?section=precisa_enviar&client=");
  });

  it("cancelado pelo cliente vai para staff em 'todos' (não há aba de cancelados)", () => {
    const branch = sql.slice(sql.indexOf("ELSIF NEW.status = 'cancelado'"));
    expect(branch.slice(0, 400)).toContain("/documentos?tab=todos&client=");
    expect(STAFF_TABS.has("cancelados")).toBe(false);
  });

  it("cancelado pela equipe vai para o histórico do cliente", () => {
    const branch = sql.slice(sql.indexOf("ELSIF NEW.status = 'cancelado'"));
    expect(branch.slice(0, 900)).toContain("/meus-documentos?section=historico&client=");
  });

  it("aguardando só usa precisa_enviar quando a ação é do cliente", () => {
    const branch = sql.slice(sql.indexOf("ELSIF NEW.status = 'aguardando'"));
    const chunk = branch.slice(0, 600);
    expect(chunk).toContain("CASE WHEN v_owner = 'client'");
    expect(chunk).toContain("section=precisa_enviar");
    expect(chunk).toContain("ELSE '/meus-documentos?client='");
  });

  it("solicitação criada pelo cliente vai para 'todos' (aguardando_cliente exige action_owner=client)", () => {
    const branch = sql.slice(sql.indexOf("IF NEW.criado_por_role = 'client' THEN"));
    expect(branch.slice(0, 300)).toContain("/documentos?tab=todos&client=");
  });

  it("arquivo final entregue usa histórico apenas nos status que o histórico cobre", () => {
    const branch = sql.slice(sql.indexOf("NEW.attachment_final_path IS NOT NULL"));
    const chunk = branch.slice(0, 800);
    expect(chunk).toContain("NEW.status IN ('recebido','concluido','cancelado')");
    expect(chunk).toContain("section=historico");
  });

  it("documento avulso não é enviado para a aba recebidos", () => {
    for (const l of insertLinks) {
      expect(l.raw).toBe("/documentos?tab=todos&client=");
    }
  });
});

describe("C3.2 — preservação de comportamento", () => {
  it("mantém SECURITY DEFINER e search_path nas duas funções", () => {
    expect(sql.match(/SECURITY DEFINER/g)?.length).toBe(2);
    expect(sql.match(/SET search_path TO 'public'/g)?.length).toBe(2);
  });

  it("não recria triggers nem altera notify_user ou notifications", () => {
    expect(sql).not.toMatch(/CREATE\s+(OR REPLACE\s+)?TRIGGER/i);
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i);
    expect(sql).not.toMatch(/FUNCTION public\.notify_user\(/);
    expect(sql).not.toMatch(/INSERT INTO public\.notifications/i);
    expect(sql).not.toMatch(/UPDATE public\.notifications/i);
    expect(sql).not.toMatch(/GRANT|REVOKE|POLICY|ALTER TABLE/i);
  });

  it("não há duplicação: cada transição de status é exclusiva (IF/ELSIF)", () => {
    const statusBlock = sql.slice(
      sql.indexOf("IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status"),
    );
    const chunk = statusBlock.slice(0, 3000);
    expect((chunk.match(/ELSIF NEW\.status =/g) ?? []).length).toBe(4);
    expect(chunk).toContain("NEW.status IS DISTINCT FROM OLD.status");
    // anexo final só notifica na primeira vez que o caminho é preenchido
    expect(sql).toContain("COALESCE(OLD.attachment_final_path,'') = ''");
  });

  it("destinatários continuam derivados no servidor", () => {
    expect(sql).toContain("public.client_staff_user_ids(NEW.client_id)");
    expect(sql).toContain("public.client_user_ids(NEW.client_id)");
    expect(sql).not.toMatch(/auth\.jwt\(\)\s*->/);
  });
});
