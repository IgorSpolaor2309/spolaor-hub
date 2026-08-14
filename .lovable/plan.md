# Plano de Atualização: Modelos de Contrato e Placeholders Variáveis

O objetivo é expandir o sistema de geração de contratos para suportar placeholders detalhados (naturza jurídica, CRC, reajuste, etc.), garantindo que os dados da contratada sejam centralizados e que o preenchimento seja robusto tanto para planos oficiais quanto para propostas personalizadas.

## 1. Configuração Institucional Centralizada
- Criar `src/lib/institucional.server.ts` para armazenar os dados fixos da Digital SC (CNPJ, Endereço, CRC-SP, etc.).
- Isso evita hardcode no código e permite atualizações rápidas em um único lugar.

## 2. Expansão da Lógica de Placeholders
- Atualizar `src/lib/contracts-management.functions.ts`:
  - Mapear novos placeholders: `{{natureza_juridica}}`, `{{endereco}}`, `{{nome_responsavel}}`, `{{cpf_responsavel}}`, `{{dia_vencimento}}`, `{{competencia_inicial}}`, `{{limite_faturamento}}`, `{{estrutura_incluida}}`, `{{vigencia}}`, `{{reajuste}}`, `{{crc_sp}}`, `{{cidade_assinatura}}`, `{{representante_contratada}}`, `{{cpf_representante_contratada}}`.
  - Integrar dados da CONTRATANTE a partir do Lead/Prospect.
  - Integrar dados da CONTRATADA a partir da nova configuração institucional.
  - Implementar lógica para "Soluções Personalizadas" buscando o snapshot imutável da `custom_proposals` aceita.
  - Adicionar validação de campos obrigatórios antes da geração.
  - Tratar placeholders opcionais vazios para evitar "undefined" ou quebras de linha.

## 3. UI de Gerenciamento de Modelos
- Atualizar `src/routes/_authenticated/contract-models.tsx`:
  - Adicionar a lista completa de novos placeholders na barra lateral do editor para fácil inserção.

## 4. Testes e Validação
- Gerar um contrato de teste para um plano padrão.
- Gerar um contrato de teste para uma proposta personalizada.
- Verificar se os dados institucionais e variáveis foram substituídos corretamente.

## Detalhes Técnicos
- Utilizar `RegExp(key, 'g')` para substituições globais.
- A configuração institucional será carregada via `import` dentro do handler do `createServerFn`.
- Placeholders vazios serão substituídos por string vazia `""`.
