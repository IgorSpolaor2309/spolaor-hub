# Plano de Implementação - FASE S4 — PLANO → OPERAÇÃO / CHECKLIST

Este plano descreve as alterações para vincular o plano comercial vigente de uma empresa à geração automática de itens operacionais (checklist) para cada competência mensal.

## Alterações Sugeridas

### 1. Banco de Dados (Supabase)
*   **RPC `generate_plan_checklist`**: Refatorar ou criar uma nova versão desta função para:
    *   Identificar o plano vigente (`client_plan_history`) para cada empresa na competência informada.
    *   Buscar os serviços contratados (`plan_services` com `inclusao` tipo 'incluido' ou 'incluido_com_limite').
    *   Criar registros em `client_checklist_items` baseados nos `plan_items` associados a esses serviços/planos.
    *   Garantir a idempotência (não duplicar itens se rodar novamente).
    *   Armazenar o `service_id` e `plan_id` de origem no item gerado para rastreabilidade.

### 2. Lógica de Backend (TanStack Start / Server Functions)
*   **`src/lib/checklist-generation.ts`**: Nova biblioteca para centralizar a lógica de orquestração da geração, caso necessário.
*   **Atualização do Cron**: Garantir que o hook de geração mensal (`src/routes/api/public/hooks/competence-monthly-generation.ts`) utilize a nova lógica baseada em planos.

### 3. Interface Administrativa (React / shadcn/ui)
*   **`src/routes/_authenticated/planos.tsx`**:
    *   Na seção de "Planos", adicionar um indicador visual nos itens do checklist que são gerados automaticamente.
    *   Mostrar quais serviços do plano têm operação vinculada.
*   **`src/routes/_authenticated/checklist.tsx`**:
    *   Confirmar que o botão "Gerar checklists da competência" utiliza a lógica atualizada.

### 4. Testes e Validação
*   Criar suíte de testes em `tests/checklist-generation-s4.test.ts` cobrindo:
    *   Empresa com plano ativo (geração correta).
    *   Empresa sem plano (sem geração automática ou comportamento legado).
    *   Serviços extras/cobrados à parte (não devem gerar checklist).
    *   Troca de plano (mudança refletida apenas na competência futura).
    *   Garantia de não duplicidade.

## Detalhes Técnicos
*   Utilizar `updated_at` e `service_id` para controle de unicidade na inserção.
*   Manter a separação entre dados comerciais e operacionais conforme instruído.
*   As RPCs serão marcadas como `VOLATILE` para permitir escrita, seguindo as melhores práticas de segurança (search_path fixo).

## O que NÃO será feito
*   Contratos, orçamentos, cobranças ou financeiro.
*   Portal do Cliente (nesta fase).
*   Alteração de checklists históricos.
