# Plano de Atualização da Estrutura Comercial

Este plano detalha a reestruturação de planos e a sincronização do catálogo de serviços conforme os novos documentos comerciais.

## Mudanças nos Planos

### 1. Renomeação e Hierarquia
Para preservar o histórico e relacionamentos, utilizaremos os IDs existentes dos planos que permanecem na hierarquia, apenas alterando seus nomes e valores.

- **Plano A**: Mantido (MEI).
- **Plano B (Atual)**: Será **excluído**. Vínculos existentes permanecem no ID antigo, mas o plano sairá do catálogo ativo.
- **Plano C (Atual)**: Renomeado para **Plano B**.
- **Plano D (Atual)**: Renomeado para **Plano C**.
- **Plano E (Atual)**: Renomeado para **Plano D**.
- **Plano Demais**: Mantido.

### 2. Atualização de Valores e Limites
Conforme a Tabela de Honorários (DOCX):
- **MEI (Plano A)**: R$ 180,00. Limite 1 nota.
- **Plano B (Novo/Ex-C)**: R$ 300,00. Faturamento até R$ 8.400. 1 sócio. 2 notas.
- **Plano C (Novo/Ex-D)**: R$ 450,00. Faturamento até R$ 15.000. 2 sócios. 5 notas.
- **Plano D (Novo/Ex-E)**: R$ 700,00 (Mensal até R$ 100k) ou R$ 1.500,00 (Mensal até R$ 300k)?
  - *Nota*: O documento lista dois valores no mesmo bloco de texto para o que parece ser o novo Plano D. Vou criar dois níveis de plano ou ajustar a descrição.

## Sincronização de Serviços Extraordinários

Baseado na planilha (XLSX) e no DOCX:
- **Preços**: Atualizar `valor_referencia` nos serviços existentes.
- **Novos Serviços**: Criar entradas em `public.services` para itens ausentes (ex: DME, DCTFWeb, etc).
- **Regra "1 Honorário"**: Utilizar `tipo_preco = 'fixo'` (com valor 0 ou nulo e observação) ou `sob_orcamento`.
- **Inclusão em Planos**: Vincular novos serviços aos planos correspondentes em `public.plan_services` e `public.plan_items` para geração automática de checklist.

## Implementação Técnica

### Fase 1: Migração de Dados (SQL)
- Atualização da tabela `public.plans` (nome, valor_padrao, descricao).
- Inserção/Update em `public.services`.
- Ajuste de `public.plan_services` e `public.plan_items` para refletir as novas inclusões.

### Fase 2: Validação
- Testar a geração de checklist para uma nova competência (ex: 2026-09) para empresas em cada plano.
- Verificar se os preços no catálogo de serviços estão corretos na UI.

### Fase 3: Relatório Final
- Listar discrepâncias encontradas nos documentos.
- Confirmar estabilidade dos vínculos existentes.

## Detalhes Técnicos
- Uso de `INSERT ... ON CONFLICT (nome) DO UPDATE` para serviços.
- Preservação de UUIDs de planos via `UPDATE public.plans SET nome = ... WHERE nome = ...`.
- Inativação do Plano B antigo (`status = 'inativo'`) em vez de deleção física, para segurança.
