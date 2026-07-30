import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/mcp/tools/get-client-summary.ts", "utf8");

describe("Fase D2.2A — get_client_summary desacoplado de public.interactions", () => {
  it("não consulta a tabela interactions", () => {
    expect(src).not.toMatch(/from\(\s*["']interactions["']\s*\)/);
  });

  it("não substitui o campo por chat ou timeline", () => {
    expect(src).not.toContain("chat_messages");
    expect(src).not.toContain("timeline_events");
  });

  it("preserva o campo ultimas_interacoes no contrato", () => {
    expect(src).toContain("ultimas_interacoes");
  });

  it("retorna sempre lista vazia em ultimas_interacoes", () => {
    expect(src).toMatch(/ultimas_interacoes:\s*\[\]/);
  });

  it("marca o campo como depreciado", () => {
    expect(src).toContain("@deprecated");
  });

  it("mantém os demais campos do payload", () => {
    for (const field of [
      "id:", "razao_social:", "nome_fantasia:", "status:", "tipo_empresa:",
      "regime_tributario:", "cidade:", "uf:", "responsaveis,",
      "pendencias_abertas:", "processos_ativos:", "solicitacoes_pendentes:",
      "guias_proximas_vencimento:", "documentos_recentes:", "checklist:",
    ]) {
      expect(src).toContain(field);
    }
  });

  it("mantém RLS/auditoria e o tratamento de erro/ausência de dados", () => {
    expect(src).toContain("withMcpAudit");
    expect(src).toContain("sanitizeError");
    expect(src).toContain("Empresa não encontrada ou sem acesso.");
    expect(src).toMatch(/count:\s*"exact"/);
  });
});

describe("Fase D2.2A — nenhum código ativo consulta interactions", () => {
  it("dashboard não consulta mais a tabela", () => {
    const dash = readFileSync("src/routes/_authenticated/index.tsx", "utf8");
    expect(dash).not.toMatch(/from\(\s*["']interactions["']\s*\)/);
  });

  it("INTERACTION_TYPES foi removido", () => {
    const types = readFileSync("src/lib/sc-types.ts", "utf8");
    expect(types).not.toContain("INTERACTION_TYPES");
  });
});
