# Plano de depreciação — Central de Documentos + Solicitações

Atualizado na **Fase 7 (transição controlada)**. Continua valendo a regra
principal: **nada de código, rota, tabela ou coluna legada foi removido**. A
Fase 7 apenas instrumenta a transição e prepara o redirect atrás de uma feature
flag que **inicia desligada**.

## 1. Itens ainda legados (em uso, não removidos)

| Item | Onde | Situação | Substituto |
| --- | --- | --- | --- |
| Rota `/solicitacoes` | `src/routes/_authenticated/solicitacoes.tsx` | Ativa, consultas próprias | Aba "Solicitações" da Central `/documentos` |
| Rota `/validades` | `src/routes/_authenticated/validades.tsx` | Ativa | Abas `vencendo` / `vencidos` da Central |
| `document_requests.attachment_final_path` / `attachment_final_name` | Tabela | Colunas mantidas por compatibilidade; **0 linhas preenchidas** hoje | `documents` + `document_request_files` (versão ativa) |
| `documents.checklist_item_id` | Tabela | Mantido; o vínculo autoritativo passou a ser feito por trigger via `client_checklist_items.document_request_id` | Triggers de conclusão da Fase 6 |
| ~~Campo `document_storage_path` no retorno da RPC staff~~ | Banco | ✅ **Removido na Fase 7.** O payload staff não expõe mais nenhum caminho de storage | `getDocumentSignedUrl` (server function, sob demanda no clique) |

## 2. Critérios objetivos para remoção

Cada item só pode ser removido quando **todos** os critérios abaixo forem verdadeiros:

1. **Uso zero por 2 ciclos de fechamento (2 competências)** — confirmado por
   telemetria de navegação e por ausência de chamadas nas suítes.
2. **Paridade funcional comprovada** — todo filtro/ação da tela antiga existe na
   Central unificada (checklist de paridade assinado pelo time de operação).
3. **Colunas legadas com contagem 0** — `select count(*) ... where <coluna> is not null` = 0
   por 30 dias consecutivos.
4. **Suítes verdes sem a tela antiga** — `document-workspace.mjs`, `portal-fase5.mjs`
   e `fase6-historico.mjs` passando com as asserções da rota antiga removidas.
5. **Aprovação explícita do responsável do módulo** registrada no changelog.

## 3. Ordem sugerida de remoção

1. ~~`document_storage_path` do payload staff~~ — **concluído na Fase 7**.
2. `attachment_final_path` / `attachment_final_name` (drop de coluna após backup).
3. Rota `/validades`.
4. Rota `/solicitacoes`.

## 4. Rollback

- **Rotas**: são arquivos isolados; o rollback é restaurar o arquivo da rota e o
  item de menu no `AppSidebar`. Não há estado no banco associado.
- **Colunas legadas**: antes de qualquer `DROP COLUMN`, exportar
  `select id, attachment_final_path, attachment_final_name from document_requests`
  para CSV. O rollback é `ALTER TABLE ... ADD COLUMN` + reimportação do CSV.
- **Payload da RPC**: alterações de RPC são migrações versionadas; o rollback é
  reaplicar a versão anterior da função (`CREATE OR REPLACE FUNCTION`).
- **Histórico de versões**: `document_request_files` nunca sofre DELETE
  (bloqueado por trigger `drf_block_delete`); versões antigas permanecem no banco
  e no storage, então qualquer rollback de UI não perde arquivo.

## 5. Fase 7 — Telemetria de rotas legadas

Tabela `public.legacy_route_access_log`, gravada **exclusivamente** pela função
`SECURITY DEFINER` `public.log_legacy_route_access(_route, _action, _client_id)`.

| Coluna | Conteúdo |
| --- | --- |
| `user_id` | usuário autenticado (`auth.uid()`) |
| `user_role` | papel resolvido no servidor: `admin` / `collaborator` / `client` |
| `route` | `/solicitacoes` ou `/validades` (CHECK constraint) |
| `action` | `view`, `open_central`, `redirect`, `filter`, `create`, `update` |
| `client_id` | empresa em contexto, quando aplicável (pode ser nulo) |
| `created_at` | data/hora |

Garantias:

- **Nenhum dado sensível**: não há coluna para título, descrição, nome de
  arquivo, conteúdo ou `storage_path`. O papel é resolvido no banco, não enviado
  pelo cliente.
- **Append-only**: não existem policies de `INSERT`/`UPDATE`/`DELETE`; a escrita
  só acontece pela função. Tentativas diretas são rejeitadas pelo RLS.
- **Leitura restrita**: cada usuário vê apenas os próprios registros; admin vê
  tudo.
- A telemetria roda somente para staff (`enabled: isStaff` no hook
  `useLegacyRouteDeprecation`), pois clientes não têm acesso a `/documentos`.

Consulta de acompanhamento:

```sql
select route, action, user_role, count(*), max(created_at)
  from public.legacy_route_access_log
 where created_at > now() - interval '30 days'
 group by 1,2,3
 order by 4 desc;
```

## 6. Fase 7 — Feature flag de redirect

- Tabela `public.app_feature_flags` (`key`, `enabled`, `description`).
- Flag: **`legacy_document_routes_redirect_enabled`**, criada com `enabled = false`.
- Leitura: `public.get_feature_flag(_key)` — retorna `false` para chave
  inexistente (fail-safe). No front: `useFeatureFlag()`.
- Escrita: `public.admin_set_feature_flag(_key, _enabled)` — **somente admin**.

Comportamento:

| Flag | `/solicitacoes` | `/validades` |
| --- | --- | --- |
| `false` (atual) | rota antiga **totalmente preservada** + aviso de depreciação + botão "Abrir Central de Documentos" | idem |
| `true` | redirect (`replace`) para `/documentos?tab=aguardando_cliente`, preservando `client` e `comp` | redirect para `/documentos?tab=vencendo`, preservando `client` |

O mapeamento de filtros vive em `src/lib/legacy-routes.ts`
(`legacyRedirectSearch`), única fonte de verdade usada tanto pelo botão manual
quanto pelo redirect automático.

## 7. Critérios objetivos para **ativar** o redirect

Ativar `legacy_document_routes_redirect_enabled = true` somente quando **todos**:

1. Aviso de depreciação publicado há ≥ 30 dias em ambas as rotas.
2. Telemetria mostra que ≥ 80% dos acessos de staff já ocorrem em `/documentos`
   (comparando `legacy_route_access_log` com o uso da Central).
3. Zero chamados abertos de paridade funcional (todo filtro/ação da tela antiga
   existe na Central).
4. Suítes `fase7-transicao.mjs`, `document-workspace.mjs`, `portal-fase5.mjs` e
   `fase6-historico.mjs` verdes.
5. Aprovação explícita do responsável do módulo.

## 8. Critérios objetivos para **remoção definitiva**

Além dos critérios da seção 2:

6. Redirect ativo (`flag = true`) por 2 competências completas sem rollback.
7. `legacy_route_access_log` com **zero** registros de `action = 'view'` nos
   últimos 60 dias (ou seja, ninguém mais chega pela rota antiga sem redirect).
8. Backup exportado das colunas legadas antes de qualquer `DROP`.

## 9. Rollback da Fase 7

| O que | Como reverter | Tempo |
| --- | --- | --- |
| Redirect indesejado | `select public.admin_set_feature_flag('legacy_document_routes_redirect_enabled', false);` — efeito imediato no próximo carregamento (cache de 60s no front) | segundos |
| Aviso de depreciação | remover `<LegacyRouteNotice .../>` das duas rotas | 1 deploy |
| Telemetria ruidosa | `revoke execute on function public.log_legacy_route_access(text, text, uuid) from authenticated;` — a chamada é best-effort e não quebra a rota | segundos |
| Campo `document_storage_path` | reaplicar a versão anterior de `list_document_workspace_paginated` via `CREATE OR REPLACE FUNCTION` (migração versionada). **Não recomendado**: a UI já opera por signed URL sob demanda | 1 migração |

Nenhuma etapa da Fase 7 apaga dados: as tabelas novas são aditivas e as rotas
antigas permanecem no repositório.

## 10. Não fazer

- Não ativar a flag de redirect sem cumprir a seção 7.
- Não apagar código legado antes de cumprir as seções 2 e 8.
- Não remover versões inativas de `document_request_files` nem objetos do storage.
- Não reintroduzir `storage_path` em qualquer payload de listagem.
