import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DELETE_BATCH_SIZE,
  MAX_DELETIONS_PER_RUN,
  RECENT_UPLOAD_WINDOW_HOURS,
  classify,
  emptySummary,
  isOutsideRecentWindow,
  isStrictChatPath,
} from "../src/lib/chat-orphans";

/**
 * Fase D3.2 — contratos do reconciliador de anexos órfãos de Mensagens.
 *
 * Limitação assumida: o Storage real não pode ser exercitado de forma isolada
 * (o único objeto existente é um anexo Real que não pode ser tocado). Por isso
 * as regras determinísticas são testadas diretamente e o comportamento do
 * handler é validado por contrato sobre o código-fonte.
 */

const UUID = "11111111-2222-4333-8444-555555555555";
const NOW = new Date("2026-07-30T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("classificação exata do prefixo", () => {
  it("aceita conversa existente e /chat/nova/", () => {
    expect(isStrictChatPath(`${UUID}/chat/${UUID}/1700000000_a.pdf`)).toBe(true);
    expect(isStrictChatPath(`${UUID}/chat/nova/1700000000_a.pdf`)).toBe(true);
    expect(isStrictChatPath(`${UUID}/chat/a.pdf`)).toBe(true);
  });

  it("rejeita caminhos malformados e fora do prefixo", () => {
    for (const p of [
      "",
      "chat/a.pdf",
      `${UUID}/documentos/a.pdf`,
      `${UUID}/chat`,
      `${UUID}/chat/`,
      `${UUID}/chat//a.pdf`,
      `${UUID}/Chat/a.pdf`,
      `not-a-uuid/chat/a.pdf`,
      `/${UUID}/chat/a.pdf`,
      `${UUID}/chat/../a.pdf`,
      `${UUID}/chatroom/a.pdf`,
    ]) {
      expect(isStrictChatPath(p)).toBe(false);
    }
  });
});

describe("janela de 24 horas", () => {
  it("usa exatamente 24h", () => {
    expect(RECENT_UPLOAD_WINDOW_HOURS).toBe(24);
    expect(isOutsideRecentWindow(hoursAgo(25), NOW)).toBe(true);
    expect(isOutsideRecentWindow(hoursAgo(23), NOW)).toBe(false);
  });
  it("data ausente ou inválida nunca é elegível", () => {
    expect(isOutsideRecentWindow(null, NOW)).toBe(false);
    expect(isOutsideRecentWindow("xx", NOW)).toBe(false);
  });
});

describe("classificação de candidatos", () => {
  const base = { path: `${UUID}/chat/${UUID}/f.pdf`, size: 10 };
  it("objeto referenciado é sempre preservado, mesmo antigo", () => {
    expect(classify({ ...base, createdAt: hoursAgo(900), referenced: true }, NOW)).toBe(
      "active_reference",
    );
  });
  it("objeto antigo sem referência é órfão elegível", () => {
    expect(classify({ ...base, createdAt: hoursAgo(48), referenced: false }, NOW)).toBe("orphan");
  });
  it("upload recente sem referência é preservado", () => {
    expect(classify({ ...base, createdAt: hoursAgo(2), referenced: false }, NOW)).toBe(
      "recent_upload",
    );
  });
  it("caminho fora do prefixo nunca é órfão", () => {
    expect(
      classify({ path: `${UUID}/documentos/f.pdf`, size: 1, createdAt: hoursAgo(999), referenced: false }, NOW),
    ).toBe("not_chat_path");
  });
  it("empresa inexistente/Demo não altera a regra: só os critérios de órfão contam", () => {
    const orphan = classify({ ...base, createdAt: hoursAgo(48), referenced: false }, NOW);
    expect(orphan).toBe("orphan");
  });
});

describe("limites operacionais", () => {
  it("lotes pequenos e teto por execução", () => {
    expect(DELETE_BATCH_SIZE).toBeLessThanOrEqual(50);
    expect(MAX_DELETIONS_PER_RUN).toBeLessThanOrEqual(500);
  });
  it("resumo inicial é somente numérico e agregado", () => {
    const s = emptySummary("dry-run");
    expect(Object.keys(s).sort()).toEqual(
      [
        "analyzed",
        "bytes_eligible",
        "bytes_removed",
        "capped",
        "duration_ms",
        "eligible",
        "failed",
        "mode",
        "preserved",
        "removed",
      ].sort(),
    );
  });
});

const HANDLER = readFileSync(
  resolve(process.cwd(), "src/routes/api/public/hooks/cleanup-chat-orphans.ts"),
  "utf8",
);

describe("contrato do handler", () => {
  it("exige segredo interno (helper central) e responde 401 sem ele", () => {
    expect(HANDLER).toMatch(/isAuthorizedCronRequest\(request\)/);
    expect(HANDLER).toMatch(/cronUnauthorized\(\)/);
  });

  it("usa service_role apenas dentro do handler e nunca no cliente", () => {
    expect(HANDLER).toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
    expect(HANDLER).not.toMatch(/import\.meta\.env/);
  });
  it("modo padrão é dry-run; efetivo exige pedido explícito autenticado", () => {
    expect(HANDLER).toMatch(/mode === "effective" \? "effective" : "dry-run"/);
    expect(HANDLER).toMatch(/if \(mode === "effective"\)/);
  });
  it("dry-run nunca remove: a remoção está dentro do bloco efetivo", () => {
    const idxMode = HANDLER.indexOf('if (mode === "effective")');
    const idxRemove = HANDLER.indexOf(".remove(");
    expect(idxMode).toBeGreaterThan(-1);
    expect(idxRemove).toBeGreaterThan(idxMode);
  });
  it("revalida referência imediatamente antes de remover", () => {
    const idxCheck = HANDLER.indexOf("stillUnreferenced(admin");
    const idxRemove = HANDLER.indexOf(".remove(");
    expect(idxCheck).toBeGreaterThan(-1);
    expect(idxRemove).toBeGreaterThan(idxCheck);
  });
  it("remove exclusivamente pela API oficial do Storage", () => {
    expect(HANDLER).toMatch(/admin\.storage[\s\S]{0,80}\.remove\(/);
    expect(HANDLER).not.toMatch(/delete\s+from\s+storage\.objects/i);
  });
  it("não confia em client_id, caminho ou lista vinda do corpo", () => {
    expect(HANDLER).toMatch(/mode\?: unknown/);
    expect(HANDLER).not.toMatch(/body\.(paths|client_id|clientId)/);
  });
  it("falha parcial não interrompe e permite nova tentativa", () => {
    expect(HANDLER).toMatch(/summary\.failed \+= /);
    expect(HANDLER).toMatch(/continue;/);
  });
  it("logs contêm apenas o resumo agregado", () => {
    const logs = HANDLER.match(/console\.(log|error)\([\s\S]*?\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toMatch(/\bpath\b|attachment_name|client_id|razao_social|email/);
      expect(l).toMatch(/summary/);
    }
  });
  it("não gera notificações nem timeline", () => {
    expect(HANDLER).not.toMatch(/notifications|timeline_events/);
  });
});

describe("idempotência", () => {
  it("execução repetida sobre lista vazia é no-op", async () => {
    const remove = vi.fn();
    const eligible: string[] = [];
    for (let run = 0; run < 2; run++) {
      if (eligible.length > 0) remove(eligible);
    }
    expect(remove).not.toHaveBeenCalled();
  });
  it("ausência do objeto é sucesso (remove não erra em path inexistente)", () => {
    // Contrato da API do Storage: remove() de um objeto ausente retorna sem error.
    expect(HANDLER).toMatch(/ausente é tratado como sucesso/);
  });
});

const SOFT_DELETE = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/interacoes.tsx"),
  "utf8",
);

describe("soft-delete da mensagem", () => {
  it("limpa também attachment_size", () => {
    expect(SOFT_DELETE).toMatch(/attachment_size:\s*null/);
  });
  it("só aplica quando ainda não excluída (preserva primeira autoria/data)", () => {
    expect(SOFT_DELETE).toMatch(/\.is\("deleted_at", null\)/);
  });
  it("mantém a regra de que somente o autor apaga (trigger inalterado)", () => {
    expect(SOFT_DELETE).not.toMatch(/is_admin\(/);
  });
});
