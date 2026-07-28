# Central de Documentos + Solicitações — Contrato de Dados (Fase 3)

Camada de dados unificada para a futura Central. Nesta fase criamos apenas
RPCs, índices e diagnóstico — **nenhuma interface, rota, upload, sheet ou
alteração de checklist é entregue aqui**.

---

## 1. RPCs criadas

| Função                                              | Papel     | Segurança             | Uso                                                    |
| --------------------------------------------------- | --------- | --------------------- | ------------------------------------------------------ |
| `list_document_workspace_paginated`                 | staff     | `SECURITY INVOKER`    | Central unificada (equipe interna, respeita RLS)       |
| `list_client_document_workspace_paginated`          | cliente   | `SECURITY DEFINER`    | Portal do cliente (whitelist manual via `client_users`) |
| `workspace_checklist_precisa_solicitar_count`       | staff     | `SECURITY INVOKER`    | Diagnóstico do futuro tab "Precisa solicitar"          |
| `_doc_workspace_status_label_staff`                 | interna   | `IMMUTABLE`           | Labels internas                                        |
| `_doc_workspace_status_label_client`                | interna   | `IMMUTABLE`           | Labels do portal                                       |

Grants: `authenticated`, `service_role`. Anon e PUBLIC revogados.

---

## 2. Modelo de retorno (linha unificada — staff)

Cada elemento em `rows` obedece a este contrato:

```jsonc
{
  "item_id": "uuid",
  "item_kind": "document_request | document",

  "client_id": "uuid",
  "empresa_nome": "string",
  "empresa_documento": "cnpj | documento",

  "titulo": "string",
  "descricao_resumida": "descricao pública da solicitação | null",
  "categoria": "string | null",
  "tipo": "tipo da solicitação | tipo do documento avulso",
  "departamento": "string | null",
  "competencia": "AAAA-MM | null",

  "status": "aguardando | recebido | reenviar | concluido | cancelado | null",
  "status_label": "Aguardando | Recebido | Reenviar | Concluído | Cancelado | Arquivado | Vencendo | Vencido",
  "action_owner": "client | staff | none",

  "prazo": "date | null",
  "data_validade": "date | null",
  "urgency": "baixa | normal | alta | null",

  "responsavel_id": "uuid | null",
  "responsavel_nome": "string | null",

  "document_id": "uuid | null",
  "document_name": "string | null",
  "document_storage_path": "string | null",
  "has_document": "boolean",

  "has_process_link": "boolean",
  "links_count": "int",
  "company_process_id": "uuid | null",
  "company_process_step_id": "uuid | null",
  "company_process_step_requirement_id": "uuid | null",
  "process_type_name": "string | null",
  "process_step_name": "string | null",

  "is_expiring": "boolean",   // validade em [hoje, hoje+30]
  "is_expired":  "boolean",   // validade < hoje

  "is_demo": "boolean",
  "demo_batch_id": "uuid | null",

  "created_at": "timestamptz",
  "updated_at": "timestamptz"
}
```

### 2.1 Origem de cada campo

| Campo                                | `item_kind = document_request`                              | `item_kind = document` (avulso)                                    |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `item_id`                            | `document_requests.id`                                       | `documents.id`                                                     |
| `titulo`                             | `document_requests.titulo`                                   | `documents.nome`                                                   |
| `descricao_resumida`                 | `document_requests.descricao`                                | `null`                                                             |
| `categoria`                          | `document_requests.categoria`                                | `documents.categoria_validade`                                     |
| `tipo`                               | `document_requests.tipo_solicitacao`                         | `documents.tipo`                                                   |
| `departamento`                       | `document_requests.departamento`                             | `null`                                                             |
| `competencia`                        | `document_requests.competencia`                              | `documents.competencia`                                            |
| `status`                             | `document_requests.status`                                   | `null` (usar `status_label` derivado)                              |
| `status_label`                       | Mapeado (ver §5)                                             | Derivado da validade (Arquivado/Vencendo/Vencido)                  |
| `action_owner`                       | Derivado (ver §3)                                            | Sempre `none`                                                      |
| `prazo`                              | `document_requests.prazo`                                    | `null`                                                             |
| `data_validade`                      | `documents.data_validade` (via `dr.document_id`)             | `documents.data_validade`                                          |
| `responsavel_id / responsavel_nome`  | `document_requests.responsavel_profile_id` + `profiles.full_name` | `null`                                                       |
| `document_*`                         | `documents.*` via `dr.document_id`                           | `documents.*`                                                      |
| `has_process_link`                   | Qualquer um dos 3 campos de vínculo em `dr`                  | `company_process_documents.*` ou `company_process_step_requirements.*` |
| `links_count`                        | 1                                                            | Total de vínculos em `company_process_documents` (∈ ℕ)             |
| `company_process_*`                  | `dr.company_process_*`                                       | Vínculo mais recente em `company_process_documents`                |
| `process_type_name / step_name`      | Via `company_processes → process_types` / `company_process_steps` | Idem, do vínculo principal                                   |
| `is_expiring / is_expired`           | `documents.data_validade` do `dr.document_id`                | `documents.data_validade`                                          |
| `is_demo / demo_batch_id`            | `document_requests.is_demo / .demo_batch_id`                  | `documents.is_demo / .demo_batch_id`                              |

### 2.2 Diferença conceitual `document_request` × `document`

- **`document_request`**: item da fila operacional. Tem `status`, `action_owner`, `prazo`, ciclo (`aguardando → recebido → concluido/reenviar/cancelado`) e pode ou não estar preenchido por um documento (`document_id`).
- **`document`**: arquivo em si, com validade opcional (`data_validade`). Como "linha da Central", só entra quando é **avulso** — isto é, quando não existe `document_request` vivo apontando para ele. Isso evita duplicação natural.

### 2.3 Portal do cliente — omissões obrigatórias

A RPC do cliente **nunca** retorna:

- `observacoes_internas` da solicitação
- `document_storage_path` (o portal deve pedir signed URL sob demanda)
- `responsavel_id`, `responsavel_nome`, IDs administrativos
- `demo_batch_id`
- `criado_por`, `criado_por_role`, autores/auditoria interna
- `deleted_by*`, `deletion_reason` e afins

E acrescenta `status_label` já traduzido para o cliente (ver §5).

---

## 3. Regra de `action_owner`

```
status = concluido | cancelado         → 'none'
status = recebido                       → 'staff'
status = reenviar                       → 'client'
status = aguardando:
  criado_por_role = 'staff'             → 'client'
  criado_por_role = 'client'            → 'staff'
  criado_por_role IS NULL:
    has_role(criado_por, 'client')      → 'staff'
    caso contrário                      → 'client'   (fallback)
document avulso                          → 'none'
```

### Limitação atual: `criado_por_role` pode estar NULL

Registros anteriores à Fase 1 podem ter `criado_por_role IS NULL`. A regra
usa o fallback baseado em `user_roles` do `criado_por`. Consequências:

- Solicitação legada sem `criado_por_role` e cujo `criado_por` NÃO é
  cliente será tratada como "aguardando cliente" — costuma ser o que se
  espera de uma solicitação criada pela equipe.
- Solicitação legada com `criado_por = NULL` também vai para "aguardando
  cliente".

Isso já cobre 100% dos registros atuais sem inventar status novo.

---

## 4. Abas suportadas (parâmetro `_tab` da RPC staff)

| `_tab`                 | Regra                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `aguardando_cliente`   | `item_kind='document_request' AND status='aguardando' AND action_owner='client'`          |
| `recebidos`            | `item_kind='document_request' AND status='recebido'`                                      |
| `reenviar`             | `item_kind='document_request' AND status='reenviar'`                                      |
| `concluidos`           | `item_kind='document_request' AND status='concluido'`                                     |
| `vinculados`           | `has_process_link = true`                                                                 |
| `vencendo`             | `is_expiring AND NOT is_expired`                                                          |
| `vencidos`             | `is_expired`                                                                              |
| `todos`                | Todos os itens visíveis, sem duplicar                                                     |

**Documento avulso** aparece em: `todos`, `vinculados` (se houver vínculo com
processo), `vencendo` e `vencidos`. Nunca aparece nas abas de status de
solicitação (aguardando/recebidos/reenviar/concluidos).

**Deduplicação**: como `doc` é `LEFT ANTI JOIN` em `document_requests`, um
mesmo `document_id` nunca aparece duas vezes na união. Múltiplos vínculos
com processo colapsam em uma única linha via `doc_links`, expondo
`links_count` e o vínculo principal (mais recente por `MAX`).

---

## 5. Labels externas

### Staff (`_doc_workspace_status_label_staff`)

| Status/derivação                               | Label       |
| ---------------------------------------------- | ----------- |
| `aguardando`                                   | Aguardando  |
| `recebido`                                     | Recebido    |
| `reenviar`                                     | Reenviar    |
| `concluido`                                    | Concluído   |
| `cancelado`                                    | Cancelado   |
| Documento sem validade                         | Arquivado   |
| Documento com validade > hoje+30               | Arquivado   |
| Documento com validade em [hoje, hoje+30]      | Vencendo    |
| Documento com validade < hoje                  | Vencido     |

### Cliente (`_doc_workspace_status_label_client`)

| Status × action_owner            | Label                                |
| -------------------------------- | ------------------------------------ |
| `aguardando` + `client`          | Aguardando você                      |
| `aguardando` + `staff`           | Aguardando a contabilidade           |
| `recebido`                       | Em análise pela contabilidade        |
| `reenviar`                       | Precisa reenviar                     |
| `concluido`                      | Concluído                            |
| `cancelado`                      | Cancelado                            |

---

## 6. Filtros server-side (staff)

Todos parâmetros da RPC:

| Parâmetro          | Tipo      | Efeito                                                                                            |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------- |
| `_search`          | `text`    | ILIKE seguro em `empresa_nome`, `empresa_documento`, `titulo`, `tipo`, `document_name`, `competencia`, `process_type_name` |
| `_client_id`       | `uuid`    | Filtra empresa                                                                                    |
| `_competencia`     | `text`    | Igualdade estrita                                                                                 |
| `_categoria`       | `text`    | Igualdade                                                                                         |
| `_tipo`            | `text`    | Igualdade                                                                                         |
| `_departamento`    | `text`    | Igualdade                                                                                         |
| `_status`          | `text`    | Só afeta requests (documentos avulsos têm `status = NULL`)                                        |
| `_action_owner`    | `text`    | `client | staff | none`                                                                           |
| `_responsavel_id`  | `uuid`    | `responsavel_profile_id`                                                                          |
| `_origem`          | `text`    | `staff | client | document_avulso`                                                                |
| `_prazo_from/_to`  | `date`    | Faixa em `prazo`                                                                                  |
| `_validade_from/_to`| `date`   | Faixa em `data_validade`                                                                          |
| `_tem_documento`   | `boolean` | Presença de `document_id`                                                                         |
| `_tem_vinculo`     | `boolean` | Vínculo com processo                                                                              |
| `_somente_meus`    | `boolean` | `responsavel_id = auth.uid()` OU `criado_por = auth.uid()`                                        |
| `_include_demo`    | `boolean` | Default `true`; `false` esconde Real/Demo                                                         |
| `_demo_batch_id`   | `uuid`    | Filtra por lote demo específico                                                                   |

Nenhum SQL dinâmico é executado: todos os filtros são cláusulas
paramétricas dentro de um `WITH … SELECT`.

---

## 7. Contagens (`counts`)

Retornadas junto com `rows` em uma única RPC, sem query separada por card.
Respeitam **exatamente** os filtros aplicados (menos `_tab`), permitindo à
UI mostrar os badges de cada aba corretos.

| Chave (staff)       | Descrição                                                                        |
| ------------------- | -------------------------------------------------------------------------------- |
| `aguardando_cliente`| Requests `aguardando` + `action_owner=client`                                    |
| `aguardando_equipe` | Requests `aguardando` + `action_owner=staff`                                     |
| `recebidos`         | Requests `recebido`                                                              |
| `reenviar`          | Requests `reenviar`                                                              |
| `concluidos`        | Requests `concluido`                                                             |
| `vencendo`          | Itens com validade em [hoje, hoje+30] e não vencidos                             |
| `vencidos`          | Itens com validade < hoje                                                        |
| `vinculados`        | Itens com `has_process_link = true`                                              |
| `sem_vinculo`       | Itens com `has_process_link = false`                                             |
| `todos`             | Total filtrado                                                                   |

| Chave (portal)               | Descrição                                                       |
| ---------------------------- | --------------------------------------------------------------- |
| `aguardando_voce`            | `aguardando` + `client`                                         |
| `aguardando_contabilidade`   | `aguardando` + `staff`                                          |
| `em_analise`                 | `recebido`                                                      |
| `precisa_reenviar`           | `reenviar`                                                      |
| `concluidos`                 | `concluido`                                                     |
| `cancelados`                 | `cancelado`                                                     |
| `todos`                      | Total filtrado                                                  |

---

## 8. Paginação e ordenação

- `_page` (default 1). Valores < 1 são normalizados para 1.
- `_page_size` (default 30, mínimo 1, **máximo 100**).
- `total` reflete a contagem após filtros (não da página).
- Uma página vazia (`_page` fora do intervalo) preserva `total` correto.
- Ordenação determinística: `COALESCE(prazo, data_validade, updated_at::date, CURRENT_DATE) ASC, updated_at DESC, item_id ASC`.

---

## 9. Segurança

- **Staff (`list_document_workspace_paginated`)** — `SECURITY INVOKER`. RLS
  original das tabelas base (documents, document_requests, clients,
  company_processes...) permanece em vigor. Colaboradores só veem
  registros vinculados à sua carteira via `client_collaborators`. Admin vê
  todos os clientes ativos. Guarda extra: `auth.uid()` obrigatório e
  `has_role(admin|collaborator)` obrigatório.
- **Cliente (`list_client_document_workspace_paginated`)** — `SECURITY DEFINER`
  com `SET search_path = public`. Restringe manualmente às empresas onde
  `client_users.user_id = auth.uid() AND ativo`. Whitelist explícita de
  colunas: campos internos e storage_path não fazem parte do jsonb
  retornado.
- Ambas rejeitam anon (`REVOKE ALL FROM anon, PUBLIC`).
- Bloqueios cross-empresa continuam garantidos por triggers da Fase 1
  (`enforce_document_requests_client_update`, etc.).
- `observacoes_internas` continua fora da RPC do cliente e das colunas
  expostas na RPC staff.

---

## 10. Índices criados (idempotentes)

| Índice                                       | Predicate parcial                                         | Query beneficiada                            |
| -------------------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| `idx_documents_client_alive`                 | `deleted_at IS NULL`                                       | Listagem por empresa                         |
| `idx_documents_client_validade_alive`        | `deleted_at IS NULL AND data_validade IS NOT NULL`         | Vencendo/vencidos por empresa                |
| `idx_documents_data_validade_alive`          | `deleted_at IS NULL AND data_validade IS NOT NULL`         | Vencendo/vencidos globais (admin)            |
| `idx_documents_client_competencia_alive`     | `deleted_at IS NULL AND competencia IS NOT NULL`           | Filtro por competência                       |
| `idx_dr_client_status_alive`                 | `deleted_at IS NULL`                                       | Abas de status                               |
| `idx_dr_prazo_alive`                         | `deleted_at IS NULL AND prazo IS NOT NULL`                 | Ordenação e filtro por prazo                 |
| `idx_dr_competencia_alive`                   | `deleted_at IS NULL AND competencia IS NOT NULL`           | Filtro por competência                       |

`pg_trgm` **não** foi habilitado nesta fase — recomendação apenas se a
busca textual passar a ser gargalo observável.

### Nota sobre EXPLAIN

O ambiente atual tem volume trivial (7 documentos, 3 solicitações). Sob
esse volume o planner escolhe `Seq Scan` para as CTEs — comportamento
esperado. Os índices são cost-effective a partir de algumas centenas de
linhas e não impactam INSERT/UPDATE porque são `PARTIAL WHERE deleted_at
IS NULL` (não são atualizados quando um registro é soft-deletado).

---

## 11. Checklist "Precisa solicitar" — diagnóstico (§7 do briefing)

`workspace_checklist_precisa_solicitar_count(_client_id, _include_demo)`
retorna 4 métricas:

- `elegiveis` — itens `status='pendente'`, sem `document_request_id` e
  sem `document_id`. Candidatos naturais à futura aba.
- `ja_com_request_ativo` — item pendente já ligado a uma solicitação.
- `ja_com_documento` — item pendente já ligado a um documento.
- `criterio` — string com a regra usada (auditoria).

**Riscos de duplicação identificados:**

1. Um mesmo pendência pode ter passado por múltiplos `document_requests`
   ao longo do tempo (reaberturas, cancelamentos). Precisamos filtrar
   apenas por `document_requests` "vivos" (`deleted_at IS NULL AND
   status NOT IN ('concluido','cancelado')`) quando exibir a aba real.
2. `client_checklist_items.document_id` pode apontar para um documento já
   arquivado por outra solicitação — evitar considerar como "faltando".
3. Se um plano regerar itens em nova competência, o mesmo título aparece
   em múltiplos itens elegíveis. Isso é intencional — não duplicar por
   estratégia, e sim por competência.

Por isso a aba real **não** entra na RPC principal nesta fase. A regra
final será validada em uma futura Fase 5.

---

## 12. Limitações e itens não implementados

- **Nova tela da Central** — não construída (é fase 4).
- **MCP `list_documents`** — não exposta ainda.
- **Upload novo, aceite/reenvio por Sheet, histórico 1:N de arquivos,
  comentários** — não incluídos.
- **Redirects ou remoção de rotas antigas** — nada foi tocado em
  `solicitacoes.tsx`, `checklist.tsx`, dashboard etc.
- **Signed URLs no portal** — a RPC do cliente já omite
  `document_storage_path`; a UI da fase 4 deverá pedir signed URL sob
  demanda usando `document_id`.
- **Real-time / broadcast** — sem `channel` novo; as tabelas base já
  emitem os eventos que serão consumidos na fase 4.
- **`pg_trgm`** — não habilitado.
- **`criado_por_role` legado NULL** — descrito em §3.

---

## 13. Filtros client-side ainda em uso (para substituir na Fase 4)

Levantamento dos pontos que já carregam listas e filtram no cliente e que
deverão migrar para os parâmetros server-side desta RPC:

- `src/routes/_authenticated/solicitacoes.tsx` — carrega
  `document_requests` da carteira via query direta e faz busca/ordenação
  em memória.
- `src/routes/_authenticated/documentos.tsx` — mesma coisa para
  `documents`.
- `src/routes/_authenticated/pendencias.tsx` — mistura `pending_tasks`,
  `document_requests` e `client_checklist_items` no cliente.
- `src/routes/_authenticated/index.tsx` (dashboard) — várias queries
  independentes para contagens.
- `src/routes/_authenticated/portal-processos.$id.tsx` — usa RPCs de
  processos, mas exibe listas de docs por vínculo no client.

Nenhum desses foi modificado nesta fase (§15 do briefing).

---

## 14. Testes

Suíte autenticada em `scripts/tests/document-workspace.mjs` — cobre 50
asserções (paginação, abas, filtros, segurança, consistência, portal),
executando via PostgREST/RPC real com JWTs de admin, colaborador e
cliente.
