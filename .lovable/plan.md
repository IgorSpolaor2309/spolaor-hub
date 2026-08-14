# Plano de Ajuste do Fluxo de Contratação - Digital SC

Este plano descreve as alterações para implementar a geração automática de contratos e a tela de revisão durante o fluxo de checkout da landing page.

## Alterações de Backend

### 1. Atualizar Intenção de Contratação (`src/lib/leads.functions.ts`)
- Ajustar a lógica de `trackLeadJourney` para garantir que o `commercial_prospect` seja criado/atualizado corretamente com o status `contratação_em_andamento` ao iniciar o checkout.

### 2. Nova Função de Validação e Geração (`src/lib/contracts-management.functions.ts`)
- Criar a função `startContractFlow` (ou atualizar a `generateContract`) para:
    - Validar dados obrigatórios do prospect/lead (CNPJ, Razão Social, Email, Endereço, etc.).
    - Gerar o contrato utilizando o modelo ativo e placeholders reais.
    - Salvar o snapshot imutável em `generated_contracts`.
    - Retornar o ID do contrato gerado.

## Alterações de Frontend

### 3. Ajuste no Botão de Checkout (`src/components/commercial/CheckoutView.tsx`)
- Alterar o texto do botão de "Quero contratar" para "Revisar contrato".
- Modificar o handler `handleConfirm` para invocar o fluxo de geração de contrato antes de redirecionar.

### 4. Nova Rota de Revisão Pública (`src/routes/revisar-contrato.$contractId.tsx`)
- Implementar uma rota pública (ou com validação de token de sessão temporária) para exibição do contrato.
- Elementos da tela:
    - Título: "Revise seu contrato".
    - Visualizador do `content_snapshot` do contrato.
    - Resumo do plano e valores.
    - Botões: "Voltar e corrigir" e "Continuar para assinatura".

## Critérios de Aceite e Testes
- Checkout deve bloquear se faltarem dados (ex: endereço extraído).
- O clique em "Revisar contrato" deve gerar um registro físico no banco em `generated_contracts`.
- A tela de revisão deve ser fiel ao conteúdo que será assinado futuramente.
- O status comercial deve evoluir para `contrato_gerado`.
- **Restrição:** Não marcar como assinado nem criar cliente/usuário nesta etapa.

## Detalhes Técnicos
- Utilização de `createServerFn` para lógica de servidor.
- Garantia de que placeholders institucionais (`src/lib/institucional.server.ts`) estão sendo aplicados corretamente.
- Persistência do `prospectId` e `leadId` através das telas via parâmetros de rota ou estado global.
