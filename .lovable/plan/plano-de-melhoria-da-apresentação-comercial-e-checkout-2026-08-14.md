# Plano de Melhoria da Apresentação Comercial e Checkout

Este plano visa aprimorar a exibição dos planos da Digital SC, garantindo que os dados venham exclusivamente do catálogo real, e corrigir a seção de serviços extras no checkout para permitir contratações adicionais sem duplicidade.

## 1. Melhoria dos Cards de Planos na Landing Page
- Refatorar a seção de planos em `src/routes/index.tsx` para exibir informações mais ricas vindas do banco:
  - Exibição clara do nome, preço e limite de faturamento.
  - Uso do campo `publico_alvo` para a frase curta de perfil.
  - Listagem dos serviços incluídos (obtidos via `plan_services`).
  - Implementação da lógica "Tudo do Plano anterior, mais:" para Planos B, C e D.
  - Adição de botão "Ver tudo que está incluído" para expandir a lista de serviços.
  - Inclusão de ícones de informação (ⓘ) com descrições simples para termos contábeis complexos.

## 2. Correção de Serviços Extras no Checkout
- Atualizar `src/components/commercial/CheckoutView.tsx`:
  - Garantir que todos os serviços ativos das categorias 'Legalização', 'Administrativo' e 'Certificados Digitais' estejam disponíveis como extras.
  - Impedir a cobrança duplicada: se um serviço extra selecionado já estiver "incluído" no plano, ele será marcado como "Incluído no seu plano" e seu valor não será somado ao total.
  - Atualizar o resumo da proposta em tempo real, separando mensalidade do plano e adicionais avulsos/recorrentes.

## 3. Persistência e Contrato
- Assegurar que os serviços extras selecionados sejam salvos no snapshot da contratação (`commercial_contracts` e `commercial_prospects`).
- Atualizar `src/lib/contracts-management.functions.ts` para que o placeholder `{{servicos_extras}}` reflita fielmente os itens escolhidos no checkout.

## Detalhes Técnicos
- **Frontend**: Edição em `src/routes/index.tsx` e `src/components/commercial/CheckoutView.tsx` utilizando componentes shadcn/ui.
- **Lógica Comercial**: Ajustes em `src/lib/commercial-calculations.ts` para lidar com a dedução de serviços já inclusos.
- **Geração de Contrato**: Refinamento do mapeamento de placeholders em `src/lib/contracts-management.functions.ts`.
- **Dados**: Nenhuma alteração de preços ou regras será feita; os dados atuais do banco são a única fonte de verdade.
