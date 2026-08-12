# Fase S6 — Contratação Comercial + Serviços Extras + Cupons

Implementar a estrutura comercial para consolidar a contratação de clientes, permitindo a composição de valores através de planos base, serviços extraordinários e cupons de desconto, mantendo o histórico de preços originais e aplicados.

## Usuário
- **Administrador:** Gestão total de planos, serviços, cupons e contratações.
- **Colaborador:** Visualização e aplicação de cupons em contratações existentes.
- **Cliente:** Visualização da sua própria contratação e valores (futuro).

## Mudanças

### Banco de Dados (Supabase)

- **Tabela `coupons`:**
  - `id` (uuid, primary key)
  - `code` (text, unique, not null) - Código do cupom (ex: BEMVINDO20)
  - `name` (text) - Nome interno para identificação
  - `description` (text) - Observação interna
  - `discount_type` (enum: 'percentage', 'fixed') - Tipo de desconto
  - `discount_value` (numeric, not null) - Valor do desconto
  - `max_discount` (numeric) - Teto para descontos em %
  - `start_date` (timestamp)
  - `end_date` (timestamp)
  - `max_uses` (integer) - Limite total de usos global
  - `max_uses_per_client` (integer) - Limite de usos por empresa
  - `apply_to` (enum: 'all', 'specific_plans', 'specific_services')
  - `status` (enum: 'active', 'inactive')
  - `created_at`, `updated_at`

- **Tabela `coupon_targets`:** (Relaciona cupons a planos/serviços específicos)
  - `id` (uuid, primary key)
  - `coupon_id` (uuid, references coupons)
  - `target_type` (enum: 'plan', 'service')
  - `target_id` (uuid) - ID do plano ou serviço

- **Refatoração/Extensão `client_commercial`:**
  - Adicionar colunas para rastreabilidade:
    - `original_value` (numeric) - Soma dos preços de tabela (plano + extras)
    - `discount_value` (numeric) - Valor total subtraído
    - `final_value` (numeric) - Valor líquido cobrado
    - `commercial_notes` (text)

- **Tabela `client_contract_services`:** (Serviços extras vinculados à contratação)
  - `id` (uuid, primary key)
  - `client_id` (uuid, references clients)
  - `service_id` (uuid, references services)
  - `valor_acordado` (numeric)
  - `created_at`

- **Tabela `client_contract_coupons`:** (Histórico de cupons aplicados)
  - `id` (uuid, primary key)
  - `client_id` (uuid, references clients)
  - `coupon_id` (uuid, references coupons)
  - `applied_at` (timestamp)

### UI / Frontend

- **Nova Aba "Cupons" em `/planos`:**
  - Listagem de cupons com filtros de status.
  - CRUD de cupons (apenas para Admin).
  - Modal de criação/edição com todas as regras de negócio solicitadas.

- **Atualização do `CommercialCard` em `/clientes/$id`:**
  - Interface para montar a contratação.
  - Seleção de Plano Base.
  - Multi-seleção de Serviços Extras (do catálogo canônico).
  - Campo para aplicar Cupom (validação em tempo real).
  - Resumo de valores (Original -> Desconto -> Final).
  - Histórico comercial (logs).

## Detalhes Técnicos

- **Cálculo de Desconto:** Centralizado em `src/lib/commercial-calculations.ts` para garantir consistência entre UI e Backend.
- **Validação de Cupons:** RPC `validate_coupon(code, client_id, items)` para verificar validade, datas e limites de uso.
- **RLS:**
  - `coupons`: Admin (ALL), Colaborador (SELECT).
  - `client_commercial`: Admin (ALL), Colaborador (SELECT/UPDATE valores específicos).
- **Testes:**
  - `tests/commercial-hiring-s6.test.ts`: Validar cálculos de cupons fixos e percentuais, limites de uso e expiração.
