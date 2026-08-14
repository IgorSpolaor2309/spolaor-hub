# Plano de Ajuste dos Fluxos de IA da Digital SC

Este plano visa aprimorar a experiência do usuário na landing page, removendo redirecionamentos automáticos e garantindo que a IA colete todos os dados necessários para o contrato antes de avançar para o checkout.

## Alterações

### 1. UX e Redirecionamento
- **Fim do redirecionamento automático**: O usuário não será mais levado à tela de diagnóstico/confirmação assim que a IA marcar a conversa como completa.
- **Botão de Ação Explicito**: Após a conclusão do diagnóstico pela IA, será exibido um botão "Ver meu plano de transição" (ou equivalente) dentro do chat.
- **Continuidade da Conversa**: A mensagem final da IA permanecerá visível para que o usuário tenha tempo de ler a conclusão.

### 2. Inteligência de Coleta de Dados
- **Mapeamento de Placeholders**: A IA passará a ter conhecimento dos campos obrigatórios reais do modelo de contrato ativo.
- **Coleta Progressiva**: O prompt do sistema será ajustado para garantir que a IA pergunte naturalmente por dados como CPF do representante, endereço completo, e-mail e telefone, caso ainda não existam no perfil do Lead.
- **Validação Cruzada**: O sistema verificará o que já foi preenchido (via CNPJ ou mensagens anteriores) e instruirá a IA a focar apenas no que falta.

### 3. Ajustes Técnicos nos Fluxos
- **Troca de Contador**: Garantir coleta de faturamento, regime, motivo da troca e dados do representante.
- **Abertura de Empresa**: Focar nos dados da pessoa física e da futura operação (faturamento estimado, tipo de negócio, sócios) para alimentar o contrato sem inventar dados jurídicos inexistentes.

## Detalhes Técnicos
- Modificação de `src/components/opening/OpeningChatFlow.tsx` e `src/components/switching/SwitchingChatFlow.tsx` para gerenciar o novo estado de conclusão com CTA.
- Atualização dos prompts em `src/lib/opening-chat.server.ts` e `src/lib/switching-chat.server.ts` para incluir a lista de campos obrigatórios dinâmicos.
- Ajuste em `src/lib/ai-gateway.server.ts` para injetar os requisitos do contrato no contexto da IA.
- Garantia de persistência total dos dados coletados no registro do `lead` via `trackLeadJourney`.

## Verificação
- Testar fluxo de "Trocar de contador" com e sem CNPJ.
- Testar fluxo de "Abrir empresa" validando se os dados do representante constam no contrato final.
- Validar se o botão "Ver meu plano" aparece e funciona corretamente sem redirecionar sozinho.