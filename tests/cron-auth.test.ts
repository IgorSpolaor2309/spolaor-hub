import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cronUnauthorized, extractCronSecret, isAuthorizedCronRequest } from "../src/lib/cron-auth";

const SECRET = "unit-test-secret-value-0123456789";

function req(headers: Record<string, string>) {
  return new Request("https://example.test/api/public/hooks/x", {
    method: "POST",
    headers,
  });
}

describe("extração do segredo", () => {
  it("lê x-cron-secret", () => {
    expect(extractCronSecret(req({ "x-cron-secret": "abc" }))).toBe("abc");
  });
  it("lê Authorization: Bearer", () => {
    expect(extractCronSecret(req({ authorization: "Bearer abc" }))).toBe("abc");
  });
  it("ignora apikey", () => {
    expect(extractCronSecret(req({ apikey: "sb_publishable_qualquer" }))).toBe("");
  });
  it("ignora Authorization sem prefixo Bearer", () => {
    expect(extractCronSecret(req({ authorization: "abc" }))).toBe("");
  });
  it("ausência de headers => string vazia", () => {
    expect(extractCronSecret(req({}))).toBe("");
  });
});

describe("resposta de recusa", () => {
  it("retorna 401 sem detalhes", async () => {
    const res = cronUnauthorized();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("autorização com CRON_SECRET no ambiente", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("aceita o segredo correto em x-cron-secret", async () => {
    expect(await isAuthorizedCronRequest(req({ "x-cron-secret": SECRET }))).toBe(true);
  });
  it("aceita o segredo correto em Bearer", async () => {
    expect(await isAuthorizedCronRequest(req({ authorization: `Bearer ${SECRET}` }))).toBe(true);
  });
  it("recusa ausência de segredo", async () => {
    expect(await isAuthorizedCronRequest(req({}))).toBe(false);
  });
  it("recusa segredo incorreto", async () => {
    expect(await isAuthorizedCronRequest(req({ "x-cron-secret": "errado" }))).toBe(false);
  });
  it("recusa segredo com mesmo tamanho porém diferente", async () => {
    const wrong = SECRET.slice(0, -1) + "X";
    expect(await isAuthorizedCronRequest(req({ "x-cron-secret": wrong }))).toBe(false);
  });
  it("recusa apenas apikey", async () => {
    expect(await isAuthorizedCronRequest(req({ apikey: SECRET }))).toBe(false);
  });
  it("recusa apenas JWT de usuário (sem Bearer válido do segredo)", async () => {
    expect(await isAuthorizedCronRequest(req({ authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.x.y" }))).toBe(
      false,
    );
  });
  it("recusa quando CRON_SECRET está vazio e não há Vault configurado", async () => {
    process.env.CRON_SECRET = "";
    expect(await isAuthorizedCronRequest(req({ "x-cron-secret": SECRET }))).toBe(false);
  });
});

const HELPER = readFileSync(resolve(process.cwd(), "src/lib/cron-auth.ts"), "utf8");
const CLEANUP = readFileSync(
  resolve(process.cwd(), "src/routes/api/public/hooks/cleanup-chat-orphans.ts"),
  "utf8",
);
const COMPETENCE = readFileSync(
  resolve(process.cwd(), "src/routes/api/public/hooks/competence-monthly-generation.ts"),
  "utf8",
);

describe("contrato do helper e das rotas internas", () => {
  it("o helper nunca loga o valor recebido", () => {
    expect(HELPER).not.toMatch(/console\.(log|error|warn)/);
  });
  it("o helper aceita o Vault como segunda fonte, comparando dentro do banco", () => {
    expect(HELPER).toMatch(/cron_secret_matches/);
    expect(HELPER).not.toMatch(/decrypted_secret/);
  });
  it("nenhuma rota interna mantém verificação duplicada de segredo", () => {
    for (const src of [CLEANUP, COMPETENCE]) {
      expect(src).toMatch(/isAuthorizedCronRequest\(request\)/);
      expect(src).not.toMatch(/process\.env\.CRON_SECRET/);
      expect(src).not.toMatch(/get\("apikey"\)/);
    }
  });
  it("a autorização acontece antes de qualquer lógica de negócio", () => {
    const idxAuth = COMPETENCE.indexOf("isAuthorizedCronRequest");
    const idxRpc = COMPETENCE.indexOf("admin_generate_monthly_competences");
    expect(idxAuth).toBeGreaterThan(-1);
    expect(idxRpc).toBeGreaterThan(idxAuth);

    const idxAuthC = CLEANUP.indexOf("isAuthorizedCronRequest");
    const idxWork = CLEANUP.indexOf("collectChatObjects(admin)");
    expect(idxAuthC).toBeGreaterThan(-1);
    expect(idxWork).toBeGreaterThan(idxAuthC);
  });
  it("o cron mensal continua restrito ao escopo real e à competência do servidor", () => {
    expect(COMPETENCE).toMatch(/p_scope:\s*"real"/);
    expect(COMPETENCE).toMatch(/p_source:\s*"cron"/);
  });
  it("nenhum segredo literal aparece no código das rotas", () => {
    for (const src of [HELPER, CLEANUP, COMPETENCE]) {
      expect(src).not.toMatch(/sb_secret_/);
      expect(src).not.toMatch(/eyJhbGciOi/);
    }
  });
});
