# Rastreabilidade — Migrations do módulo Processos

> Documento vivo. **Não renomear migrations já aplicadas.** Para alterar
> comportamento vigente, crie nova migration com nome descritivo e atualize
> este arquivo apontando a substituição.

## Convenções

- Nomes futuros: `YYYYMMDDHHmmss_<motivo_descritivo>.sql`
  (ex.: `fix_processes_staff_rls_and_admin_delete.sql`).
- Cada migration nova toca uma preocupação (RLS, RPC, índices, etc.).
- "Vigente" = última migration que representa o estado atual daquele artefato.

## Tabelas base

| Artefato | Finalidade | Vigente em |
| --- | --- | --- |
| `public.process_types` | Catálogo de tipos de processo | migration inicial do módulo |
| `public.process_steps` | Modelo de etapas por tipo | migration inicial do módulo |
| `public.process_step_requirements` | Requisitos por etapa modelo | migration inicial do módulo |
| `public.company_processes` | Processo instanciado numa empresa | criação inicial + fix RLS staff |
| `public.company_process_steps` | Etapas do processo instanciado | criação inicial + fix RLS staff |
| `public.company_process_step_requirements` | Requisitos por etapa da empresa | criação inicial + fix RLS staff |
| `public.company_process_documents` | Vínculo processo × documento | criação inicial |

## RPCs principais

| RPC | Finalidade | Notas | Estado |
| --- | --- | --- | --- |
| `open_company_process(_client_id, _process_type_id, _responsavel_id, _prazo_final, _prioridade, _observacoes, _is_demo, _demo_batch_id)` | Abre um processo e instancia etapas | Assinatura antiga (sem `_is_demo/_demo_batch_id`) foi removida por `DROP FUNCTION IF EXISTS` | vigente |
| `client_list_processes(...)` | Portal do cliente | Corrigido para eliminar ambiguidade `id` (`fix_client_list_processes_ambiguous_columns`) | vigente |
| `processos_indicadores()` | Indicadores agregados (KPIs / por responsável / por tipo) | Usado na listagem interna e detalhe | vigente |
| `processos_notificar_vencimentos()` | Manutenção. `EXECUTE` restrito a `service_role` | Chamada por cron externo | vigente |
| `admin_demo_wipe(...)` | Limpeza de dados demo (integra Processos) | Restrito a admins | vigente |
| **`list_company_processes_paginated(...)`** | **Listagem interna paginada, com filtros/ordem no servidor. `SECURITY INVOKER` (RLS aplica). Retorna `{ rows, total, page, page_size }` com nome do responsável agregado.** | **Novo — item ALTO 5/6 da auditoria** | **vigente** |
| **`list_my_process_steps_paginated(...)`** | **Etapas atribuídas ao usuário logado, paginadas. Substitui o `.limit(500)` do frontend.** | **Novo — item ALTO 5** | **vigente** |

## RLS

| Escopo | Vigente |
| --- | --- |
| `company_processes` staff SELECT/INSERT/UPDATE via `user_has_client_access`, DELETE apenas admin | `fix_processes_staff_rls_and_admin_delete` |
| `company_process_steps` acesso via `EXISTS` no processo pai | `fix_processes_staff_rls_and_admin_delete` |
| `company_process_step_requirements` acesso via `EXISTS` na etapa pai | `fix_processes_staff_rls_and_admin_delete` |

## Grants `SECURITY DEFINER`

- Migração de hardening: `REVOKE ALL ... FROM PUBLIC, anon` em 16 funções do
  módulo (triggers, RPCs admin, portal, manutenção). `GRANT EXECUTE` apenas a
  papéis autorizados (`authenticated` ou `service_role`).
- As novas RPCs `list_company_processes_paginated` e
  `list_my_process_steps_paginated` são `SECURITY INVOKER`, com
  `REVOKE ... FROM PUBLIC, anon` e `GRANT EXECUTE TO authenticated, service_role`.

## Índices

Estado atual (não foram criados novos índices nesta etapa — cobertura
suficiente para os filtros movidos ao servidor):

- `company_processes`: `client_id`, `responsavel_id`, `status`,
  `process_type_id`, `prazo_final`, `demo_batch_id` (parcial `is_demo=true`).
- `company_process_steps`: `(company_process_id, ordem)`, `responsavel_id`,
  `status`, `prazo`, `demo_batch_id` (parcial `is_demo=true`).

Justificativa: filtros no RPC batem em colunas com índice btree
existente; busca textual `ILIKE '%…%'` não beneficia de btree e representa
um custo aceitável dado o volume atual. Caso o volume cresça, avaliar
`pg_trgm` (índice GIN) em `clients.razao_social` e `clients.nome_fantasia`.

## Como adicionar uma nova migration do módulo

1. Crie um arquivo com nome descritivo (nunca renomeie migrations aplicadas).
2. Escreva SQL idempotente (`CREATE OR REPLACE`, `DROP ... IF EXISTS`,
   `CREATE INDEX IF NOT EXISTS`).
3. Se substituir função ou policy anterior, marque aqui em "Vigente".
4. Atualize a coluna "Vigente" da linha correspondente.
