# Plano de depreciação — Central de Documentos + Solicitações (pós-Fase 6)

Este documento registra o estado legado remanescente após a Fase 6. **Nada foi
removido** e **nenhum redirect foi criado**. As rotas antigas continuam
funcionando normalmente.

## 1. Itens ainda legados (em uso, não removidos)

| Item | Onde | Situação | Substituto |
| --- | --- | --- | --- |
| Rota `/solicitacoes` | `src/routes/_authenticated/solicitacoes.tsx` | Ativa, consultas próprias | Aba "Solicitações" da Central `/documentos` |
| Rota `/validades` | `src/routes/_authenticated/validades.tsx` | Ativa | Abas `vencendo` / `vencidos` da Central |
| `document_requests.attachment_final_path` / `attachment_final_name` | Tabela | Colunas mantidas por compatibilidade; **0 linhas preenchidas** hoje | `documents` + `document_request_files` (versão ativa) |
| `documents.checklist_item_id` | Tabela | Mantido; o vínculo autoritativo passou a ser feito por trigger via `client_checklist_items.document_request_id` | Triggers de conclusão da Fase 6 |
| Campo `document_storage_path` no retorno da RPC staff `list_document_workspace_paginated` | Banco | Ainda presente no payload staff (não usado pelo Portal nem pelo MCP) | `getDocumentSignedUrl` (server function) |

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

1. `document_storage_path` do payload staff (troca por signed URL sob demanda).
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

## 5. Não fazer

- Não criar redirects de `/solicitacoes` ou `/validades` para `/documentos`.
- Não apagar código legado antes de cumprir a seção 2.
- Não remover versões inativas de `document_request_files` nem objetos do storage.
