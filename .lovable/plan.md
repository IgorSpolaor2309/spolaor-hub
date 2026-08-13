# Plano de Implementação: Estrutura Interna de Contratação Digital SC

Este plano detalha a criação da estrutura de contratações, permitindo a transição de um lead (prospect) para um cliente operacional após a assinatura do contrato.

## Alterações de Banco de Dados

### 1. Tabela `commercial_contracts`
Armazenará os dados da contratação vinculada ao prospect.
- `id`: uuid
- `prospect_id`: uuid (FK `commercial_prospects`)
- `plan_id`: uuid (FK `plans`)
- `plan_value`: numeric (valor no momento da contratação)
- `extra_services`: jsonb (lista de serviços extras e seus valores)
- `applied_coupon`: text
- `discount_value`: numeric
- `final_value`: numeric
- `contract_data`: jsonb (dados necessários para o contrato: razão social, CNPJ, endereço, etc.)
- `status`: enum (`aguardando_contrato`, `contrato_enviado`, `contrato_assinado`, `cancelado`)
- `signed_at`: timestamptz
- `created_at`: timestamptz

### 2. Automação de Conversão (Função RPC)
Uma função `process_signed_contract` que, ao marcar um contrato como `contrato_assinado`:
1. Verifica se já foi processado (idempotência).
2. Cria o registro em `public.clients`.
3. Cria/vincula a empresa em `public.companies`.
4. Vincula o plano contratado em `public.client_plan_history`.
5. Cria o usuário do portal (se ainda não existir) e vincula ao cliente.
6. Mantém a rastreabilidade atualizando o `commercial_prospect` com o `client_id` gerado.

## Backend (Server Functions)

- `src/lib/contracts.functions.ts`:
  - `getContracts`: Listagem para o painel administrativo.
  - `updateContractStatus`: Atualiza o status e dispara a automação se for assinado.
  - `getContractDetails`: Detalhes de um contrato específico.

## Frontend (Painel Administrativo)

### 1. Visualização de Contratações
- Nova aba ou seção dentro de "Gestão de Leads" ou uma rota dedicada em `src/routes/_authenticated/contracts.tsx`.
- Tabela com filtros por status.
- Botão para visualizar detalhes e gerenciar o status.

### 2. Fluxo de "Quero Contratar"
- Atualizar o `CheckoutView.tsx` para, além de registrar a intenção no prospect, criar um registro inicial em `commercial_contracts` com status `aguardando_contrato`.

## Detalhes Técnicos (Segurança)
- RLS nas novas tabelas permitindo acesso apenas a `admin` e `collaborator`.
- `GRANT` explícito em `public.commercial_contracts` para `authenticated` e `service_role`.
- Uso de `security definer` na função de automação para garantir que as criações de registros em tabelas operacionais ocorram corretamente.

---
**Nota**: Não será implementada assinatura digital real ou gateway de pagamento nesta fase, apenas a estrutura lógica e a transição manual/simulada.
