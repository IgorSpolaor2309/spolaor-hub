# Multiempresa para contas de cliente — SC Central

Objetivo: permitir que uma mesma conta de cliente acesse várias empresas/CNPJs, sem misturar dados nem quebrar o que existe. Fazer a menor alteração possível.

## 1. Banco de dados (1 migração)

**Nova tabela `public.client_users`**
- `id uuid pk`
- `client_id uuid → clients(id) on delete cascade`
- `user_id uuid → auth.users(id) on delete cascade`
- `papel text` (responsavel | financeiro | socio | operacional | outro), nullable
- `ativo boolean default true`
- `criado_por uuid`
- `created_at`, `updated_at`
- `unique(client_id, user_id)`
- GRANTs padrão (`authenticated`, `service_role`); RLS habilitada
- Políticas:
  - SELECT: admin OR `user_id = auth.uid()` OR colaborador vinculado ao client
  - INSERT/UPDATE/DELETE: somente admin (`has_role(auth.uid(),'admin')`)
- Trigger `set_updated_at`

**Backfill (idempotente, na mesma migração)**
```sql
INSERT INTO public.client_users (client_id, user_id, ativo)
SELECT id, owner_profile_id, true FROM public.clients
WHERE owner_profile_id IS NOT NULL
ON CONFLICT (client_id, user_id) DO NOTHING;
```
`clients.owner_profile_id` NÃO é removido (compatibilidade).

**Atualizar `user_has_client_access`** para considerar `client_users.ativo = true` além do `owner_profile_id` e do vínculo de colaborador. Mantém assinatura — todas as RLS existentes continuam válidas.

**Atualizar `client_staff_user_ids`**: continua devolvendo apenas equipe (admin + colaboradores). Sem mudança.

**Atualizar `profiles_shares_client`**: incluir vínculo via `client_users` para que nomes apareçam corretamente no chat multiempresa.

**Notificações com nome da empresa**: ajustar as funções `on_document_request_change`, `on_tax_guide_change`, `on_document_insert_notify`, `on_chat_message_insert` para concatenar nome fantasia/razão social no título/mensagem. Loop de destinatários do owner passa a iterar `client_users` ativos (em vez de single `owner_profile_id`).

## 2. Helpers de frontend

- `src/lib/client-display.ts` — `clientLabel(c)` retorna Nome Fantasia ⟶ Razão Social ⟶ CNPJ; `clientShort(c)` para chips.
- `src/hooks/use-my-clients.ts` — devolve `{ clients, selectedId, setSelectedId }` lendo `clients` aos quais o usuário tem acesso (RLS faz o filtro). Persiste seleção em `localStorage`. Inclui opção “Todas as empresas”.
- `src/components/sc/CompanySelector.tsx` — `<Select>` reutilizável usado no dashboard, chat e Minha área.

## 3. Telas (alterações mínimas)

- **Dashboard cliente** (`routes/_authenticated/index.tsx`): se >1 empresa, mostrar `CompanySelector`; agregados respeitam seleção. Cards/listas sempre mostram empresa.
- **Minha área** (`minha-area.tsx`): listar todas as empresas vinculadas com nome, CNPJ, status e atalhos para solicitações/guias/documentos/chat daquela empresa.
- **Listagens** (`solicitacoes`, `documentos`, `guias`, `validades`, `pendencias`, `minhas-pendencias`, `kanban`, `notificacoes`, `interacoes`): adicionar coluna/linha “Empresa” usando `clientLabel`. Já carregam `clients(...)` no select — adicionar onde faltar.
- **Chat** (`interacoes.tsx`): a lista de conversas já é por `client_id`. Garantir título “Chat — {empresa}” no topo e nome da empresa em cada item da sidebar. Cliente com várias empresas vê várias conversas (já suportado pela query atual).
- **Admin – edição de cliente** (`clientes.$id.tsx`): nova seção “Usuários com acesso a esta empresa” listando `client_users`, com botões adicionar (autocomplete por e-mail entre perfis existentes), desativar/reativar, remover. Impedir duplicados via unique.
- **Admin – edição de usuário cliente** (onde existir gestão de contas, p.ex. `colaboradores.tsx`/configurações): se houver tela de contas de cliente, adicionar “Empresas vinculadas a esta conta” espelhando o mesmo CRUD a partir do outro lado. Caso não exista uma tela dedicada hoje, o CRUD pelo lado do cliente (item anterior) já cobre.
- **Verificação de vínculos** (se houver tela em `configuracoes.tsx`): adicionar contagens — contas sem empresa, empresas sem usuário cliente, contas com múltiplas empresas, vínculos inativos.

## 4. Compatibilidade

- `owner_profile_id` preservado; queries antigas continuam funcionando.
- Backfill garante que clientes atuais ganham linha em `client_users` automaticamente.
- Nenhuma RLS é afrouxada — `user_has_client_access` só ganha mais um OR.

## 5. Itens explicitamente fora do escopo

OMIE, Consulta CNPJ, planos, pagamentos, marketplace, login público, cadastro público, refatoração ampla, remoção de `owner_profile_id`.

## Entregáveis ao final

Lista de tabelas alteradas, migração de dados, arquivos editados, telas com seletor/identificação, comportamento do chat, políticas RLS ajustadas e checklist de testes manuais (admin, colaborador, cliente com 1 e com N empresas; criação/remoção de vínculo; chat por empresa; notificações com nome de empresa).
