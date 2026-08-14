# Plano de Correção: Geração e Regeneração de Contratos Digital SC

Este plano visa corrigir a precisão dos dados nos contratos (placeholder mapping) e permitir a regeneração correta de contratos em estado de revisão.

## 1. Padronização do Preenchimento Automático (Placeholder Mapping)

Refatorar a função `generateContract` em `src/lib/contracts-management.functions.ts` para garantir a precedência correta dos dados e evitar o uso indevido de nomes de contato como Razão Social.

### Mudanças Técnicas
- **Nova Estratégia de Coleta**:
  - `razao_social`: Prioridade para dados do CNPJ oficial > Lead estruturado > IA extraída. Nunca usar nome do contato se houver CNPJ.
  - `endereco`: Prioridade para consulta oficial do CNPJ > Lead estruturado > IA extraída.
  - `nome_responsavel`: Dados do representante legal salvos no Lead/Diagnóstico.
  - `cpf_responsavel`: CPF coletado e salvo no Lead.
- **Objeto Único de Dados**: Criar um `contractData` centralizado antes de montar os placeholders para garantir consistência.
- **Logging**: Implementar `console.log` específicos para auditoria rápida dos dados mapeados.

## 2. Implementação do Fluxo de Regeneração

Corrigir a lógica de proteção contra duplicidade para permitir que usuários atualizem seus dados e regenerem o snapshot do contrato enquanto este estiver no status `contrato_gerado`.

### Mudanças Técnicas
- **Lógica de Verificação de Existência**:
  - Permitir regeneração se o contrato existente estiver nos status `aguardando_contrato` ou `contrato_gerado`.
  - Se um contrato em revisão já existir, atualizar o registro atual (`UPDATE`) em vez de ignorar a requisição ou criar um novo.
- **Atualização de Snapshot**:
  - Re-processar todos os dados do Lead/Empresa.
  - Gerar novo `content_snapshot` e recalcular `validation_errors`.
  - Preservar o histórico no banco de dados (metadata/logs).
- **Feedback Visual**: Garantir que o `CheckoutView.tsx` trate erros de regeneração e limpe o estado de loading corretamente.

## 3. Validação e Testes

- **Teste de Fluxo Ponta a Ponta**: 
  1. Gerar contrato com dados incompletos.
  2. Corrigir dados no Lead/Checkout.
  3. Clicar em "Gerar novamente".
  4. Validar se o novo snapshot em `/revisar-contrato` reflete as mudanças.
  5. Verificar persistência após F5.
