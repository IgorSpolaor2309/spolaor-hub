# Plano de Diagnóstico e Correção: Exibição de Contratos

O objetivo deste plano é diagnosticar e corrigir definitivamente a falha na exibição de contratos na rota de revisão pública, garantindo que o fluxo desde o checkout até a renderização do snapshot esteja íntegro.

## Diagnóstico e Instrumentação

1. **Logs de Fluxo**: Adição de logs detalhados em todas as etapas críticas:
   - `CONTRACT_GENERATION_START`: Início da função de servidor.
   - `CONTRACT_CREATED`: Confirmação de persistência no banco com ID e tamanho do snapshot.
   - `CHECKOUT_CONFIRMED`: Recebimento do ID no frontend.
   - `CONTRACT_ID_REDIRECT`: Momento exato da navegação.
   - `REVIEW_ROUTE_ID`: Captura do parâmetro na URL.
   - `CONTRACT_FETCH_RESULT`: Retorno da busca segura via `supabaseAdmin`.
   - `RENDER_CONTRACT`: Confirmação de que os dados chegaram ao componente de UI.

2. **Segurança e Acesso**:
   - Reforçar que a rota pública utilize exclusivamente a server function `getContractForReview` (já implementada, mas será validada).
   - Garantir que a função use `supabaseAdmin` para contornar RLS restritivo de tabelas comerciais, mantendo a segurança via validação de ID único.

## Correções Técnicas

1. **Prevenção de Condição de Corrida**:
   - Garantir que o `navigate` no `CheckoutView` ocorra apenas APÓS o retorno bem-sucedido e persistido da função `generateContract`.
   - Utilizar o ID retornado diretamente do banco para evitar desalinhamento de dados.

2. **Robustez da Interface**:
   - Implementar estados de erro e loading mais descritivos na tela de revisão.
   - Adicionar uma mensagem técnica temporária caso o `content_snapshot` venha vazio, facilitando a identificação de falhas na geração (placeholders).
   - Ajustar o CSS para garantir que o conteúdo não fique oculto (min-height e overflow).

3. **Geração de Conteúdo**:
   - Validar se a substituição de placeholders em `generateContract` está produzindo uma string válida e não-vazia.

## Validação e Teste de Aceitação

- Executar um teste E2E completo:
  - Iniciar uma contratação via Landing (Fluxo IA).
  - Preencher dados reais/fictícios no Checkout.
  - Clicar em "Revisar contrato".
  - Comprovar que a URL final contém o UUID do contrato e que o texto é exibido integralmente na tela.

---

### Detalhes Técnicos (para consulta)

- Tabelas envolvidas: `commercial_prospects`, `contract_models`, `generated_contracts`.
- Rota: `/revisar-contrato/$contractId`.
- Funções: `generateContract`, `getContractForReview`.
