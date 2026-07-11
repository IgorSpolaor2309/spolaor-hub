# Central de Homologação e Testes

Área administrativa em `Configurações → Homologação e Testes`, acessível apenas a administradores, para testar fluxos do SC Central com dados fictícios sem afetar produção.

Dado o tamanho do escopo (16 blocos), proponho entregar em **4 fases sequenciais**, cada uma validável isoladamente. Confirme se aprova o plano completo ou se quer começar somente pela Fase 1.

---

## Regra central de segurança

Todos os dados criados pela Central recebem:

- coluna `is_demo boolean default false` nas tabelas afetadas (clients, collaborators, profiles, processes, plans, documents, document_requests, tax_guides, notifications, timeline_events, checklist items);
- coluna `demo_batch_id uuid` apontando para tabela nova `demo_batches` (id, created_by, created_at, label, status, counts_json);
- tabela `demo_audit_log` (id, admin_id, action, batch_id, payload_json, created_at) para auditoria de todas as ações da Central.

**Toda limpeza/restauração filtra obrigatoriamente por `is_demo = true`** via RPC `SECURITY DEFINER` que valida `has_role(auth.uid(), 'admin')` e nunca aceita ids sem essa marca. Nenhum código de teste toca linhas com `is_demo = false`.

Notificações e integrações externas checam `is_demo` do destinatário e são bloqueadas quando o modo homologação estiver ativo para dados reais.

---

## Fase 1 — Fundação e Ambiente de Demonstração

**Migração 1:**
- `demo_batches`, `demo_audit_log` (com GRANTs, RLS, políticas admin-only via `has_role`);
- adicionar `is_demo`, `demo_batch_id` nas tabelas listadas acima (default false, index parcial `where is_demo`);
- RPC `admin_demo_create_environment()` — cria 3 empresas fictícias + perfis + dados operacionais coerentes em transação única;
- RPC `admin_demo_wipe(batch_id?)` — apaga somente `is_demo = true`;
- RPC `admin_demo_reset()` — wipe + create em transação;
- RPC `admin_demo_summary()` — contagens por tabela.

**Página `/configuracoes/homologacao`** (route sob `_authenticated/`, gate extra `has_role admin`):
- header com aviso permanente "Ambiente de homologação";
- seção Ambiente: botões Criar / Restaurar / Limpar / Recriar com dialog de confirmação reforçada mostrando o `admin_demo_summary()`;
- seção Histórico das execuções lendo `demo_audit_log`.

## Fase 2 — Contas, Cenários e Prévia

- Seção **Contas de teste**: lista as contas fictícias (email, perfil, empresas, status, última utilização). Reutiliza `adminCreateUser` / redefinição de senha existentes — sem senhas fixas na tela.
- **Gerador de cenários**: RPCs `admin_demo_scenario(kind, client_id)` para cada cenário listado (etapa vencida, aguardando cliente, checklist incompleto, etc.), sempre marcando `is_demo = true`.
- **Visualizar como usuário**: drawer read-only que renderiza sidebar + páginas principais com um `previewAsUserId` em contexto React. Não altera sessão nem `auth.uid()`; queries continuam com RLS do admin (documentado como "prévia visual, não teste de permissão").

## Fase 3 — Automações, Saúde e Notificações

- Seção **Execução de automações**: lista rotinas existentes (checklist mensal, notificações de processos, validades). Cada uma com botões **Simulação** (dry-run, retorna JSON do que faria) e **Executar em demonstração** (filtra `is_demo = true`). Reutiliza funções já existentes com um parâmetro `_scope text default 'demo'`.
- **Painel de saúde**: RPC `admin_health_check()` retornando array de checks (empresas sem colaborador, etapas sem responsável, processos concluídos <100%, checklists duplicados, etc.) classificados saudável/atenção/erro com links.
- Guarda em `notifications`/envios externos: helper `should_send_notification(user_id)` que bloqueia envio real quando destinatário tem `is_demo = true` no modo errado, e vice-versa.

## Fase 4 — Checklist de Homologação, Bugs e Testes Automatizados

- Tabelas `homolog_test_cases` (módulo, cenário, perfil, resultado esperado, status, responsável, data, observação) e `homolog_issues` (título, descrição, passos, gravidade, status, anexos_json). Seed com os testes listados nos blocos 10 e 11.
- UI de checklist com filtros por módulo/status e diálogo para registrar problema.
- **Testes automatizados**: o projeto não tem Vitest/Playwright configurados. Entrego base mínima com Vitest + 3-4 smoke tests (utilitários puros de `src/lib/`) e um `README` explicando como rodar. Playwright fica para fase futura conforme instrução.

---

## Detalhes técnicos

- **Rota**: `src/routes/_authenticated/configuracoes.homologacao.tsx` com `beforeLoad` chamando `has_role admin` via server fn; sidebar entry visível só para admin.
- **Server functions**: `src/lib/homologacao.functions.ts` com `requireSupabaseAuth` + `ensureAdmin`. RPCs pesados em SQL para atomicidade.
- **Sem crons novos**: reutiliza `plan_checklist_cron_log` e rotas `/api/public/hooks/*` existentes; a Central só invoca as funções manualmente.
- **RLS**: `is_demo` não relaxa nenhuma policy existente. Novas tabelas (`demo_batches`, `demo_audit_log`, `homolog_*`) têm policy `USING (has_role(auth.uid(), 'admin'))`.
- **Auditoria**: todo RPC administrativo grava em `demo_audit_log` antes de commitar.
- **Índices**: parciais `WHERE is_demo = true` nas tabelas grandes (documents, notifications, timeline_events).

---

## O que fica fora desta entrega

- IA / OCR / leitura automática de documentos (explicitamente excluídos);
- Playwright end-to-end (fase futura);
- Troca real de identidade / impersonation com `auth.uid()` — a prévia é apenas visual;
- Módulo de suporte completo — apenas registro simples de bugs de homologação.

---

**Confirme:** aprovo entregar as 4 fases em sequência (uma por turno) ou prefere que eu comece já implementando a Fase 1 agora?
